"use strict";
const TeleBot = require('./telebot');
const fs = require('fs');
const request = require('request');
const sys = require('util');
const exec = require('child_process').exec;

const db = require('./lib/db.js');
const config = require('./config.js');

const BOT_TOKEN = config.api_token;
const TEST_MODE = config.test_mode;

const bot = new TeleBot({
	token: BOT_TOKEN,
	sleep: 1000,
	timeout: 0,
	limit: 100,
	retryTimeout: 5000,
	modules: {
	}
});

const Chat = require('./lib/Chat.js')(bot);
const From = require('./lib/From.js')(bot);

function debug(...args) {
	if (TEST_MODE) {
		console.log(...args);
	}
}

class Image {
	constructor(from) {
		this.id = db.getAndIncreaseNextImageId();
		this.filename = this.id + '.jpg';
		this.contributor = from.id;
		this.isPublished = true;
	}
}

class Message {
	//from: { id, first_name?, last_name?, username }
	//chat: { id, first_name?, last_name?, username, type ('private') }
	//date, type, time, remove, photo?
	constructor(data, t, r) {
		Object.assign(this, data, t, r);
		this.chat = Chat.get(this.chat);
		this.from = From.get(this.from);
		this.chat.log(' < ' + this.type + ': ' + this.text);
		debug('New ' + this.type + ':', this);
	}

	isFromTester() {
		console.log('msg.isFromTester called by ', this.from);
		console.log('testers: ', config.testers);
		return config.testers.includes(this.from.id);
	}

	ensureAccess(func) {
		if (!TEST_MODE || this.isFromTester()) {
			func();
		} else {
			let replymsg = 'Tut mir leid, ' + this.from.first_name + ', aber ich werde gerade gewartet. Bitte versuch es später noch einmal!';
			this.reply(replymsg);
		}
	}

	reply(text) {
		this.chat.send(text);
	}
}

let commands = {
	'/help': { act: msg => {
		msg.reply('PDF2PNG Bot Version 0001 (by /u/Itja)\n' +
				'Send me a PDF and I will convert it to a PNG.');
		if (msg.from.isAdmin()) {
			msg.reply('Hi admin');
		}
	} }, 

	'/asfile': { act: (msg) => {
		msg.chat.file = true;
		msg.reply('From now on, I will send you images as a file to avoid compression through Telegram');
	} },

	'/asimg': { act: (msg) => {
		msg.chat.file = false;
		msg.reply('From now on, I will send you images directly (may have compression artifacts by Telegram)');
	} },

	'/user': {
		actAdmin: (msg, cmd) => {
			if (cmd.length < 3) {
				msg.reply('Usage: /user set USERID PROPERTY VALUE\n/user show USERID [PROPERTY]');
				return;
			} else {
				let target = From.getById(cmd[2]);
				if (!target) {
					msg.reply('User with ID ' + cmd[2] + ' not found');
					return;
				}

				if (cmd[1] == 'show') {
					let ret = cmd[3] ? target[cmd[3]] : target;
					msg.reply(JSON.stringify(ret));
				} else if (cmd[1] == 'set') {
					try {
						target[cmd[3]] = JSON.parse(cmd[4]);
						msg.reply('Set ' + cmd[3] + ' to ' + cmd[4] + ' on User with ID ' + cmd[2]);
					} catch(e) {
						msg.reply('It doesn\'t seem that the following is a valid value: ' + cmd[4]);
					}
				}

			}
		}
	},

	'/printdb': {
		actAdmin: (msg, cmd) => {
			try {
				if (cmd[1]) {
					let ret = db.db[cmd[1]];
					if (cmd[2]) {
						ret = ret[cmd[2]];
					}
					msg.reply(JSON.stringify(ret));
				} else {
					msg.reply('Usage: /printdb { nextImgId | chats | froms | images | status }');
				}
			} catch (e) {
				msg.reply('That clearly didn\'t work.');
				console.log(e);
			}
		}
	},

	'/gnampf': {
		act: (msg) => {
			if (msg.isFromTester()) {
				msg.from.admin = true;
				msg.reply('ok');
				return;
			}
			msg.reply('Niemals!');
		}
	}
}

bot.on('text', (data, t, r) => {
	let msg = new Message(data, t, r);
	msg.ensureAccess(() => {
		if (msg.text.startsWith('/')) {
			let cmd = msg.text.split(/\s+/);
			let cmdAvailable = true;

			let curCmd = commands[cmd[0]];
			if (curCmd) {
				if (curCmd.actAdmin && msg.from.isAdmin()) {
					curCmd.actAdmin(msg, cmd);
				} else if (curCmd.actPoster && msg.from.isPoster()) {
					curCmd.actPoster(msg, cmd);
				} else if (curCmd.act) {
					curCmd.act(msg, cmd);
				} else {
					msg.reply('Go away.');
					cmdAvailable = false;
				}
			} else {
				msg.reply('I don\'t know this command. Try /help');
				cmdAvailable = false;
			}

			msg.chat.log(cmdAvailable ? 'Command executed!' : 'Command NOT executed.');
		} 
		db.write(); 
	});
});

bot.on('document', (data, t, r) => {
	let msg = new Message(data, t, r);
	msg.ensureAccess(() => {
		let doc = msg.document;
		console.log(msg.from.id + ' (' + msg.from.first_name + ') sent ' + doc.file_name + ' Size: ' + doc.file_size + ' (' + doc.file_id + ')');
		bot.getFile(doc.file_id).then(file => {
			if (file.ok) {
				debug(file);
				let filename = doc.file_id + '.pdf'; 
				let filedest = 'img/' + filename;
				let targetFileStream = fs.createWriteStream(filedest);
				request
					.get('https://api.telegram.org/file/bot' + BOT_TOKEN + '/' + file.result.file_path)
					.pipe(targetFileStream)
					.on('error', err => {
						console.error('Error while streaming image to file', newImage, file);
						console.error(targetFileStream);
						msg.reply('Sorry, something went wrong (3)');
					})
					.on('finish', () => {
						console.log('Stored as ' + filedest + '. Processing..');
						msg.reply('Please wait while I\'m processing the file..');
						let convprefix = 'out/' + doc.file_id;
						let convfile = convprefix + '.png';
						exec('pdftoppm -f 1 -singlefile -png ' + filedest + ' ' + convprefix, function(err, stdout, stderr) {
							if (err) {
								console.log('pdftoppm returned ERROR:', err, '. OUT:', stdout, '. ERR:', stderr);
							} else {
								console.log('Converted file.');
								msg.chat.sendDocument(convfile, {fileName: doc.file_name + '.png'});
							}
						});
					});

			} else {
				console.error('Error while fetching file path. The Server responded with !file.ok');
				msg.reply('Sorry, something went wrong (2)');
			}
		}).catch(e => {
			console.error('Could not fetch file path', e, msg);
			msg.reply('Sorry, something went wrong (1)');
		});
	});
});

//Bot Events: /* /<cmd> connect disconnect reconnecting reconnected update tick error inlineQuery inlineChoice callbackQuery
//Action Events: keyboard, button, inlineKeyboard, inlineButton, answerList, getMe, sendMessage, forwardMessage, sendPhoto, sendAudio, sendDocument, sendSticker, sendVideo, sendVoice, sendLocation, sendVenue, sendContact, sendChatAction, getUserProfilePhotos, getFile, kickChatMember, unbanChatMember, answerInlineQuery, answerCallbackQuery, editMessageText, editMessageCaption, editMessageReplyMarkup, setWebhook
//Message Events: * text audio voice document photo sticker video contact location venue

/* Initialization */
bot.connect();
