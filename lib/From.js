const db = require('./db.js');
let bot = null;

module.exports = (botvar) => {
	bot = botvar;
	return From;
}

class From {

	constructor (from, fromDB) {
		Object.assign(this, from);
		if (!fromDB) {
			this.admin = false;
			this.poster = false;
		}
	}

	static get(fromdata, init = true) {
		let from = db.getFrom(fromdata.id);
		if (from instanceof From) {
			return from;
		} else {
			if (from) {
				from = new From(from, true);
				from.log('First message from this user since start');
			} else if (init) {
				from = new From(fromdata, false);
				from.log('First message from this user ever!');
			} else {
				return null;
			}
			db.setFrom(from.id, from);
		}
		return from;
	}

	static getById(id) {
		return From.get({id}, false);
	}

	isAdmin() {
		return this.admin;
	}

	isPoster() {
		return this.admin || this.poster;
	}

	send(text) {
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

