'use strict';

var os = require('os');
var nodeStatic = require('node-static');
var http = require('http');
var socketIO = require('socket.io');
var express = require('express');
var path = require('path');

var fileServer = new(nodeStatic.Server)();
var port = process.env.PORT || 2014
var app = express();
app.engine('html', require('ejs').renderFile);

app.use(express.static(path.join(__dirname, 'public')));

var server = app.listen(port, function () {
  var host = server.address().address
  var port = server.address().port
})

app.get('/:room', function(req, res) {
  res.render('room.html');
});
app.get('/', function(req, res) {
  res.send('index.html');
});

var io = socketIO.listen(server);
io.sockets.on('connection', function(socket) {

  // convenience function to log server messages on the client
  function log() {
    var array = ['Message from server:'];
    array.push.apply(array, arguments);
    socket.emit('log', array);
  }

  socket.on('message', function(message, room) {
    log('Client said: ', message);
    socket.broadcast.to(room).emit('message', message);
  });

  socket.on('create or join', function(room) {
    log('Received request to create or join room ' + room);

    var clients = io.sockets.adapter.rooms[room];
    var numClients = (typeof clients !== 'undefined') ? Object.keys(clients).length : 0;

    if (numClients === 0) {
      socket.join(room);
      log('Client ID ' + socket.id + ' created room ' + room);
      socket.emit('created', room, socket.id);
      log('Room ' + room + ' now has ' + numClients + 1 + ' client(s)');
    } else if (numClients === 1) {
      log('Client ID ' + socket.id + ' joined room ' + room);
      log('Room ' + room + ' now has ' + numClients + 1 + ' client(s)');
      io.sockets.in(room).emit('join', room);
      socket.join(room);
      socket.emit('joined', room, socket.id);
      io.sockets.in(room).emit('ready');
    } else { // max two clients
      socket.emit('full', room);
    }
  });

  socket.on('ipaddr', function() {
    var ifaces = os.networkInterfaces();
    for (var dev in ifaces) {
      ifaces[dev].forEach(function(details) {
        if (details.family === 'IPv4' && details.address !== '127.0.0.1') {
          socket.emit('ipaddr', details.address);
        }
      });
    }
  });
});
