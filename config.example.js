module.exports = {
	api_token: 'INSERT TOKEN HERE', 
	test_mode: false, //if true, only 'testers' can use the bot

	/* NEVER set this to true in production or on systems that you need and love
	** it allows all telegram users recognized as superadmins (see 'testers' below) to eval() anything they like
	** that means they have access to the system the bot runs on as if they were in a 'node' command under the bot's user */
	allow_eval: false, 

	//array with ids of superadmins
	superadmins: [10000000, 123240292], 
};
