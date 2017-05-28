//exports see end of file
const fs = require('fs');
const DB_FILE = 'db.json';
const RESET = false;

class DatabaseClient {
	constructor(file, doReset) {
		this.filename = file;
		try { 
			fs.accessSync(file);
		} catch (err) {
			doReset = true;
		}
		if (doReset) {
			this.reset();
		} else {
			this.read();
		}
	}

	reset() {
		this.db = {
			chats: {},
			froms: {},
		}
	}

	write() {
		let data = JSON.stringify(this.db);
		fs.writeFileSync(this.filename, data, { encoding: 'utf8' });
		console.log('Wrote config to file');
	}

	read() {
		this.db = JSON.parse(fs.readFileSync(this.filename, { encoding: 'utf8' }));
		console.log('Read config from file');
		if (!this.db.froms) { //migration
			this.db.froms = {};
		}
	}

	addImage(img) {
		this.db.images[img.id] = img;
	}

	getImage(id) {
		return this.db.images[id];
	}

	getAndIncreaseNextImageId() {
		return this.db.nextImgId++;
	}

	getAllImages() {
		return this.db.images;
	}

	getAllImageIds() {
		return Object.keys(this.db.images);
	}

	getChat(id) {
		return this.db.chats[id];
	}

	getAllChatIds() {
		return Object.keys(this.db.chats);
	}

	setChat(id, chat) {
		this.db.chats[id] = chat;
	}

	persistChat(chat) {
		this.setChat(chat.id, chat);
	}

	getFrom(id) {
		return this.db.froms[id];
	}

	getAllFromIds() {
		return Object.keys(this.db.froms);
	}

	setFrom(id, from) {
		this.db.froms[id] = from;
	}

	persistFrom(from) {
		this.setFrom(from.id, from);
	}
}

const db = new DatabaseClient(DB_FILE, RESET);
module.exports = db;
