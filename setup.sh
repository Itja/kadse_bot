#!/bin/bash
git clone --depth=1 https://github.com/kosmodrey/telebot.git
cd telebot
rm -rf test
ln -s ../node_modules/ node_modules
npm install --production
