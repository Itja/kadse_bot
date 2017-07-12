const db = require('./db.js');
let bot = null;

module.exports = (botvar) => {
	bot = botvar;
	return Chat;
}

class Chat {

	constructor (chat, fromDB) {
		Object.assign(this, chat);
		if (!fromDB) {
			this.seenImages = []; 
			this.kdt = true;
			this.seenNoUnseenLeftMsg = false;
			this.filterContributors = [];
		}
	}

	static get(chatdata, init = true) {
		let chat = db.getChat(chatdata.id);
		if (chat instanceof Chat) {
			return chat;
		} else {
			if (chat) {
				chat = new Chat(chat, true);
				chat.log('First chat since start');
			} else if (init) {
				chat = new Chat(chatdata, false);
				chat.log('New Chat!');
			} else {
				return null;
			}
			db.setChat(chat.id, chat);
		}
		return chat;
	}

	static getById(id) {
		return Chat.get({id}, false);
	}

	resetSeenImages() {
		this.seenImages = [];
	}

	getUnseenImage() {
		//keep if id not in this.seenImages
		let unseenImages = db.getAllImageIds().filter(i => this.seenImages.indexOf(i) < 0);
		//keep if contributor not in this.filterContributors
		if (this.filterContributors && this.filterContributors.length) {
			unseenImages = unseenImages.filter(i => this.filterContributors.indexOf(db.getImage(i).contributor) < 0);
		}
		if (!unseenImages.length) return null;
		let id = unseenImages[Math.floor(Math.random()*unseenImages.length)];
		this.seenImages.push(id);
		return db.getImage(id);
	}

	sendUnseenImage() {
		let uimg = this.getUnseenImage();
		if (!uimg) {
			this.log('User has no unseen image left');
			if (!this.seenNoUnseenLeftMsg) {
				this.send('Tut mir leid! Du hast schon alle Bilder gesehen. Wenn du die nochmal sehen möchtest, schreibe mir "/reset". Ansonsten warte einfach, bis es mehr Bilder gibt.');
				this.seenNoUnseenLeftMsg = true;
			}
		} else {
			this.sendImage(uimg);
			this.seenNoUnseenLeftMsg = false;
		}
	}

	sendImageById(id) {
		let img = db.getImage(id);
		this.sendImage(img);
	}

	sendImage(img) {
		if (!img) {
			this.send('Tut mir leid! Es gibt keine Kadse mit dieser Nummer (mehr).');
			return;
		}
		let txt = 'Kadse Nummer ' + img.id;
		let from = db.getFrom(this.id);
		if (from != null && from.admin) {
			txt += ' (von: ' + img.contributor + ')';
		}
		this.sendPhoto('img/' + img.filename, { caption: txt });
	}

	send(text) {
		if (text.length > 1000) {
			text.substring(0, 1000) + '...';
		}
		this.log(' > :' + text);
		bot.sendMessage(this.id, text);
	}

	sendPhoto(filename, data) {
		this.log('Sending photo ', filename, data);
		bot.sendPhoto(this.id, filename, data);
	}

	log(...args) {
		console.log(this.first_name + '(' + this.id + '): ', ...args);
	}
}

