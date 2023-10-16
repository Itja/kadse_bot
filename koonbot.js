"use strict";
const telegram = require('node-telegram-bot-api');
const fs = require('fs');
const request = require('request');

const db = require('./lib/db.js');
const config = require('./config.js');

const BOT_TOKEN = config.api_token;
const TEST_MODE = config.test_mode || false;
const ALLOW_EVAL = config.allow_eval || false;

const options = {
	token: BOT_TOKEN,
	polling: true
}

const bot = new telegram(BOT_TOKEN, options);

/*
const bot = new TeleBot({
	token: BOT_TOKEN,
	sleep: 1000,
	timeout: 0,
	limit: 100,
	retryTimeout: 5000,
	modules: {
	}
});
*/

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

	isFromSuperadmin() {
		//console.log('msg.isFromSuperadmin called by ', this.from);
		//console.log('superadmins: ', config.superadmins);
		return config.superadmins.includes(this.from.id);
	}

	ensureAccess(func) {
		if (!TEST_MODE || this.isFromSuperadmin()) {
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
		msg.reply('Kadse_Bot Version 7923 (von @Mitja)\n' +
				'/stop - Du bekommst keine Kadse des Tages mehr\n' +
				'/set X - Du bekommst die Kadse des Tages um X Uhr, anstatt um 18 Uhr\n' +
				'/start - Du bekommst wieder die Kadse des Tages\n' +
				'/reset - Gesehene Bilder zurücksetzen\n' +
				'/show kadse_nummer - Zeige die Kadse mit der Nummer kadse_nummer');
		if (msg.from.isPoster()) {
			msg.reply('Sende dem Bot ein Bild, damit er es aufnimmt. Bitte nur kadsenrelevante, schöne Bilder senden!');
		}
		if (msg.from.isAdmin()) {
			msg.reply('Admin commands: stats shutdown user printdb delimg kdtforce eval broadcast');
			msg.reply('Disable kdt for user: /eval db.db.chats["CHAT_ID"] = false');
		}
	} }, 

	'/stop': { act: (msg) => {
		msg.chat.kdt = false;
		msg.reply('Okay, dann bekommst du halt keine Kadse des Tages mehr! (Wenn du deine Meinung änderst, schreib mir /start, um wieder Kadsen des Tages zu erhalten.)');
	} },

	'/start': { act: (msg) => {
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

	'/set': {
		act: (msg, cmd) => {
			let wantedHour = parseInt(cmd[1]);
			if (isNaN(wantedHour) || wantedHour > 23 || wantedHour < 0) {
				msg.reply('Bitte gib eine Zahl zwischen 0 und 23 an! (z.B. Für 14:00 Uhr: /set 14)')
				return;
			}
			msg.chat.kdthour = wantedHour;
			msg.reply('Ab sofort erhältst du die Kadse des Tages um ' + wantedHour + ':00 Uhr.')
			db.write();
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

	'/chat': {
		actAdmin: (msg, cmd) => {
			if (cmd.length < 3) {
				msg.reply('Usage: /chat set CHATID PROPERTY VALUE\n/chat show CHATID [PROPERTY]');
				return;
			} else {
				let target = Chat.getById(cmd[2]);
				if (!target) {
					msg.reply('Chat with ID ' + cmd[2] + ' not found');
					return;
				}

				if (cmd[1] === 'show') {
					let ret = cmd[3] ? target[cmd[3]] : target;
					msg.reply(JSON.stringify(ret, function(k,v) {return k==='seenImages'?v.length+'imgs':v}));
				} else if (cmd[1] === 'set') {
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

	'/user': {
		actAdmin: (msg, cmd) => {
			if (cmd.length < 3) {
                                let rpl = ''
                                let allIds = db.getAllFromIds()
				msg.reply('Usage: /user set USERID PROPERTY VALUE\n/user show USERID [PROPERTY]\nCurrently, there are ' + allIds.length + ' users (froms) in the database:\n');

                                let showall = cmd.length == 2 && cmd[1] == 'showall'

                                let i = 0
                                for (let j = 0; j < allIds.length; j++)
                                {
                                    let fid = allIds[j]
                                    let c = null
                                    if (fid in db.db.chats) {
                                       c = db.db.chats[fid] 
                                    }
                                    console.log('checking', fid, c, showall)
                                    let kdt = c && (!c.hasOwnProperty('kdt') || c.kdt)
                                    if (!showall && !kdt)
                                        continue
                                    i++
                                    let f = db.getFrom(fid)
                                    let lastname = (f.last_name ? ' ' + f.last_name : '')
                                    let ct = 'No chat'
                                    if (c) {
                                       ct = 'KDT ' + (kdt ? 'on' + (c.kdthour ? ' at ' + c.kdthour : '') + (!c.hasOwnProperty('kdt') ? ' [neverstop]' : '')  : 'off') 
                                         + (c.seenImages ? ' with ' + c.seenImages.length + ' seen images' : '')
                                    } 
                                    let rights = (f.admin ? ' (ADMIN)' : '') + (f.poster ? ' (Poster)' : '') 
                                    rpl += '[' + fid + '] ' + f.first_name + lastname + rights + ': ' + ct + '\n'
                                    if (i % 16 == 15) {
                                        msg.reply(rpl)
                                        rpl = ''
                                    }
                                }
                                msg.reply(rpl)
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
					msg.reply(JSON.stringify(ret).slice(0,1000));
				} else {
					msg.reply('Usage: /printdb { nextImgId | chats | froms | images | status }');
				}
			} catch (e) {
				msg.reply('That clearly didn\'t work.');
				console.log(e);
			}
		}
	},

	'/eval': {
		actAdmin: (msg) => {
			if (ALLOW_EVAL) {
				try {
					let command = msg.text.substr(msg.text.indexOf(' ') + 1);
					console.log('EVAL: ', command);
					let ret = JSON.stringify(eval(command));
					console.log(ret);
					if (typeof ret !== 'string') {
						ret = typeof ret;
					}
					msg.reply(ret.slice(0,1000));
				} catch (e) {
					msg.reply('That clearly didn\'t work: ' + e.message);
					console.log(e);
				}
			} else {
				msg.reply('Eval isn\'t enabled.');
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
				if (!c.hasOwnProperty('kdt') || c.kdt) { //no broadcast to users not receiving kdt
					c.send(bct);
				}
			});
		}
	},

	'/gnampf': {
		act: (msg) => {
			if (msg.isFromSuperadmin()) {
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
			console.log('is command: ' + msg.text);
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
			msg.reply('Danke für das Bild. Leider kenne ich dich noch nicht genug, um es in meine Sammlung aufzunehmen. Vielleicht ein andernmal.');
			return;
		}
		bot.getFile(msg.photo[msg.photo.length - 1].file_id).then(file => {
			debug(file);
			if (file && file.file_path) {
				let newImage = new Image(msg.from);
				let fileUrl = 'https://api.telegram.org/file/bot' + BOT_TOKEN + '/' + file.file_path;
				//debug('Loading URL', fileUrl);
				let targetFileStream = fs.createWriteStream('img/' + newImage.filename);
				request
					.get(fileUrl)
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
				console.error('Error while fetching file path. The Server responded with !file.file_path', file);
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
	let currentHour = curt.getHours();
	let totalNoParty = 0;
	let totalParty = 0;
	if (forced) {
		console.log('Forced party for all guests!')
	}
	console.log(currentHour, "It's party time!", new Date());
	db.getAllChatIds().forEach((cid) => {
		let c = Chat.getById(cid);
		if (c && (!c.hasOwnProperty('kdt') || c.kdt)) { //migration, if no property, then do kdt
			let kdthour = c.hasOwnProperty('kdthour') ? c.kdthour : 18;
			if (kdthour === currentHour || forced) {
				if (!forced) {
					c.send('Es ist ca. ' + curt.getHours() + ' Uhr und damit mal wieder Zeit für die Kadse des Tages! (Du möchtest die Kadse des Tages nicht mehr? Schreib mir /stop)');
				} else {
					c.send('Hier eine Kadse außer der Reihe!');
				}
				c.sendUnseenImage();
				totalParty++;
			} else { totalNoParty++; }
		}
	});
	
	if (!forced) {
		setTimeout(party, 1000 * 60 * 60);
		console.log(currentHour, 'Party with', totalParty, 'guests is over.', totalNoParty, 'will party another time.');
	}
	db.write();
};

setImmediate(() => {
	let d = new Date();
	let cur = new Date();
	d.setHours(d.getHours() + 1);
	d.setMinutes(0);
	d.setSeconds(0);
	d.setMilliseconds(0);
	let diff = d.getTime() - cur.getTime();
	console.log('First party is at ', d, ' (which is in ', diff, 'ms)');
	setTimeout(party, diff);
});

//Bot Events: /* /<cmd> connect disconnect reconnecting reconnected update tick error inlineQuery inlineChoice callbackQuery
//Action Events: keyboard, button, inlineKeyboard, inlineButton, answerList, getMe, sendMessage, forwardMessage, sendPhoto, sendAudio, sendDocument, sendSticker, sendVideo, sendVoice, sendLocation, sendVenue, sendContact, sendChatAction, getUserProfilePhotos, getFile, kickChatMember, unbanChatMember, answerInlineQuery, answerCallbackQuery, editMessageText, editMessageCaption, editMessageReplyMarkup, setWebhook
//Message Events: * text audio voice document photo sticker video contact location venue

/* Initialization */
//bot.connect();
