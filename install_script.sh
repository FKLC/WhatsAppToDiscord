#!/bin/bash
# INSTALL SCRIPT FOR WhatsappToDiscord
# i am bad at bash scripting but i tried to make a simple script, please run with root 
# done by vishyvishal14
# installing nodejs 
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

apt update && apt upgrade

git clone https://github.com/FKLC/WhatsAppToDiscord

cd WhatsAppToDiscord

echo "Your Node Version:"
node -v
npm install
node .


