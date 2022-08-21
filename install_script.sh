#!/bin/bash
# INSTALL SCRIPT FOR WhatsappToDiscord
# i am bad at bash scripting but i tried to make a simple script, please run with root 
# done by vishyvishal14
# installing nodejs 

# update reps
apt update && apt upgrade
#pull node setup
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
# install nodejs
sudo apt-get install -y nodejs
# update reps again 
apt update && apt upgrade
# clone the git
git clone https://github.com/FKLC/WhatsAppToDiscord
# get into that dir ;-;
cd WhatsAppToDiscord
#node version show
echo "Your Node Version:"
node -v
# install required packages/dependencies
npm install
# run the program
node .


