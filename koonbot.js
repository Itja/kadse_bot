"use strict";
const TeleBot = require('./telebot');
const fs = require('fs');
const request = require('request');

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
		msg.reply('Kadse_Bot Version 2001 (von @Mitja)\n' +
				'/kdtstop - Du bekommst keine Kadse des Tages mehr\n' +
				'/kdtstart - Du bekommst wieder die Kadse des Tages\n' +
				'/reset - Gesehene Bilder zurücksetzen\n' +
				'/show kadse_nummer - Zeige die Kadse mit der Nummer kadse_nummer');
		if (msg.from.isPoster()) {
			msg.reply('Sende dem Bot ein Bild, damit er es aufnimmt. Bitte nur kadsenrelevante, schöne Bilder senden!');
		}
		if (msg.from.isAdmin()) {
			msg.reply('Admin commands: stats shutdown user printdb delimg kdtforce');
		}
	} }, 

	'/kdtstop': { act: (msg) => {
		msg.chat.kdt = false;
		msg.reply('Okay, dann bekommst du halt keine Kadse des Tages mehr! (Wenn du deine Meinung änderst, schreib mir /kdtstart, um wieder Kadsen des Tages zu erhalten.)');
	} },

	'/kdtstart': { act: (msg) => {
		msg.chat.kdt = true;
		msg.reply('Ab sofort bekommst du wieder die Kadse des Tages!');
	} },

	'/reset': { act: (msg) => {
		msg.chat.resetSeenImages();
		msg.reply('Deine gesehenen Bilder wurden zurückgesetzt. Viel Spaß mit dem immergleichen Catcontent!');
	} },

	'/deleteme': { act: (msg) => {
		msg.reply('Unimplemented');
	} },

	'/stats': { 
		act: (msg) => {
			msg.reply(JSON.stringify(msg.chat));
			if (msg.from.isPoster()) {
				msg.reply('Stats for posters.. coming soon');
			}
			if (msg.from.isAdmin()) {
				msg.reply('Stats for admins.. coming soon');
			}
		}
	},
	
	'/show': {
		act: (msg, cmd) => {
			if (parseInt(cmd[1]) > 0) {
				msg.chat.sendImageById(parseInt(cmd[1]));
			} else {
				msg.reply('Usage: /show KADSE_NUMMER');
			}
		}
	},

	'/shutdown': {
		actAdmin: (msg) => {
			db.write();
			msg.reply('Shutdown not implemented');
		}
	},

	'/kdtforce': {
		actAdmin: (msg) => {
			setImmediate(party, true);
			msg.reply('Gonna party right away!');
		}
	},

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

	'/delimg': {
		actAdmin: (msg, cmd) => {
			try {
				let imgid = parseInt(cmd[1]);
				if (imgid > 0) {
					delete db.db['images'][imgid];
					msg.reply('If there has been such an image, it has been deleted.');
				} else {
					msg.reply('Usage: /delimg IMAGE_ID');
				}
			} catch (e) {
				msg.reply('Error: ' + e);
				console.log(e);
			}
		}
	},

	'/broadcast': {
		actAdmin: (msg) => {
			let bct = msg.text.substr(msg.text.indexOf(' ') + 1);
			console.log('BROADCAST! Text is: ', bct);
			db.getAllChatIds().forEach((cid) => {
				let c = Chat.getById(cid);
				c.send(bct);
			});
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
		let sendImg = false;
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
					msg.reply('Von dir lasse ich mir soetwas nicht sagen!');
					cmdAvailable = false;
				}
			} else {
				msg.reply('Diesen Befehl kenne ich nicht. Vielleicht hilft dir /help ?\n Ich hoffe, du bist stattdessen mit dieser Katze zufrieden?');
				cmdAvailable = false;
				sendImg = true;
			}

			msg.chat.log(cmdAvailable ? 'Command executed!' : 'Command NOT executed.');
		} else { 
			sendImg = true;
		}
		if (sendImg) {
			msg.chat.sendUnseenImage();
		}
		db.write(); 
	});
});

bot.on('photo', (data, t, r) => {
	let msg = new Message(data, t, r);
	msg.ensureAccess(() => {
		if (!msg.from.isPoster()) {
			msg.reply('Danke für das Bild. Leider kenne ich dich noch nicht genug, um es in meine Datenbank aufzunehmen. Vielleicht ein andernmal.');
			return;
		}
		bot.getFile(msg.photo[msg.photo.length - 1].file_id).then(file => {
			if (file.ok) {
				debug(file);
				let newImage = new Image(msg.from);
				let targetFileStream = fs.createWriteStream('img/' + newImage.filename);
				request
					.get('https://api.telegram.org/file/bot' + BOT_TOKEN + '/' + file.result.file_path)
					.pipe(targetFileStream)
					.on('error', err => {
						console.error('Error while streaming image to file', newImage, file);
						console.error(targetFileStream);
						msg.reply('Sorry, leider ist mit dem Bild was schiefgegangen :-( (3)');
					})
					.on('finish', () => {
						console.log('New Image (' + newImage.id + ') uploaded successful, writing config..');
						db.addImage(newImage);
						db.write(); 
						return msg.reply('Danke für das Bild. Sehr hübsch. Ich habe es mit der ID ' + newImage.id + ' abgelegt.');
					});

			} else {
				console.error('Error while fetching file path. The Server responded with !file.ok');
				msg.reply('Sorry, leider ist mit dem Bild was schiefgegangen :-( (2)');
			}
		}).catch(e => {
			console.error('Could not fetch file path', e, msg);
			msg.reply('Sorry, leider ist mit dem Bild was schiefgegangen :-( (1)');
		});
	});
});

let party = (forced) => {
		let curt = new Date();
		console.log("It's showtime!", new Date());
		db.getAllChatIds().forEach((cid) => {
			let c = Chat.getById(cid);
			if (!c.hasOwnProperty('kdt') || c.kdt) { //migration, if no property, then do kdt
				c.send('Es ist ca. ' + curt.getHours() + ' Uhr und damit mal wieder Zeit für die Kadse des Tages! (Du möchtest die Kadse des Tages nicht mehr? Schreib mir /kdtstop)');
				c.sendUnseenImage();
			}
		});
		
		console.log('Party is over.');
		if (!forced) {
			setTimeout(party, 1000 * 60 * 60 * 24);
			console.log('Next Partytime set.');
		}
		db.write();
	};

setImmediate(() => {
	let d = new Date();
	let partyHour = 18;
	let cur = new Date();
	d.setHours(partyHour);
	d.setMinutes(0);
	d.setSeconds(0);
	d.setMilliseconds(0);
	if (cur.getHours() >= partyHour) {
		console.log('Party is a day away :-/');
		d.setDate(cur.getDate() + 1);
	}
	let diff = d.getTime() - cur.getTime();
	console.log('Party is at ', d, ' (which is in ', diff, 'ms)');
	setTimeout(party, diff);
});

//Bot Events: /* /<cmd> connect disconnect reconnecting reconnected update tick error inlineQuery inlineChoice callbackQuery
//Action Events: keyboard, button, inlineKeyboard, inlineButton, answerList, getMe, sendMessage, forwardMessage, sendPhoto, sendAudio, sendDocument, sendSticker, sendVideo, sendVoice, sendLocation, sendVenue, sendContact, sendChatAction, getUserProfilePhotos, getFile, kickChatMember, unbanChatMember, answerInlineQuery, answerCallbackQuery, editMessageText, editMessageCaption, editMessageReplyMarkup, setWebhook
//Message Events: * text audio voice document photo sticker video contact location venue

/* Initialization */
bot.connect();
