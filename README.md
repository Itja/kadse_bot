## Setup
1. Run `npm install`
2. Run `./setup.sh`, which pulls telebot and links it's node modules
3. Copy `config.example.js` to `config.js` and put in your bot API key and your telegram user ID
4. Run the bot using `node koonbot.js`
5. Write your bot `/gnampf`, if he answers `ok`, then you're an admin now. If not, your telegram user id is missing in the `config.js` file. Look now into the output of the process to find out your user id.
6. Find out all commands using `/help`

## Commands
### Promotion
Use `/user set USERID poster true` to promote someone to being a **poster**, so that he/she can post new images to your bot.
