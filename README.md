# WebRTC Hero

This repository contains an experiment using NodeJS to determine how much functionality from
tools like Screenhero and HipChat can be reproduced in-browser using WebRTC. At
the moment, WebRTC Hero is little more than a basic WebRTC chat app.

Check out the demo site [here](https://webrtc-hero.herokuapp.com/)

## Usage

After installing Node and NPM, clone the repository and install the dependencies:
```
git clone https://github.com/andycandrea/webrtc-hero.git

npm install node-static
npm install socket.io
npm install webrtc
```

Then, start the server:
```
node server.js
```

If you've set everything up properly, go to `localhost:2014` to check it out.
