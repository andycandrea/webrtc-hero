'use strict';

var isChannelReady = false;
var isInitiator = false;
var isStarted = false;
var localStream, pc, remoteStream, turnReady;
var peerConnection;
var localAvatar;
var remoteAvatar;

var $outgoingText = $('.outgoing').first();
var $textHistory = $('.text-history').first();

var pcConfig = {
  'iceServers': [{
    'url': 'stun:stun.l.google.com:19302'
  }]
};

// Set up audio and video regardless of what devices are present.
var sdpConstraints = {
  'mandatory': {
    'OfferToReceiveAudio': true,
    'OfferToReceiveVideo': true
  }
};

/////////////////////////////////////////////
var $roomButton = $('#join-room');

$roomButton.on('click', function() {
  window.room = $('#room-name').val();

  peerConnection = new PeerConnection(window.room);
});

function sendText() {
  peerConnection.sendText();
}

function PeerConnection(room) {
  var socket = io.connect();

  if (room !== '') {
    socket.emit('create or join', room);
    $('.local-buttons').removeClass('hidden');
  }

  socket.on('created', function(room) {
    console.log('Created room ' + room);
    isInitiator = true;
    localAvatar = 'cap';
    remoteAvatar = 'batman';

    $('#local-avatar').addClass('avatar-' + localAvatar);
    $('#remote-avatar').addClass('avatar-' + remoteAvatar);
  });

  socket.on('full', function(room) {
    console.log('Room ' + room + ' is full');
  });

  socket.on('join', function (room) {
    console.log('Another peer made a request to join room ' + room);
    console.log('This peer is the initiator of room ' + room + '!');
    isChannelReady = true;
  });

  socket.on('joined', function(room) {
    console.log('joined: ' + room);
    isChannelReady = true;
  });

  socket.on('log', function(array) {
    console.log.apply(console, array);
  });

  function sendMessage(message) {
    console.log('Client sending message: ', message);
    socket.emit('message', message);
  }

  // This client receives a message
  socket.on('message', function(message) {
    console.log('Client received message:', message);
    if (message === 'got user media') {
      maybeStart();
    } else if (message.type === 'offer') {
      if (!isInitiator && !isStarted) {
        maybeStart();
      }
      pc.setRemoteDescription(new RTCSessionDescription(message));
      doAnswer();
    } else if (message.type === 'answer' && isStarted) {
      pc.setRemoteDescription(new RTCSessionDescription(message));
    } else if (message.type === 'candidate' && isStarted) {
      var candidate = new RTCIceCandidate({
        sdpMLineIndex: message.label,
        candidate: message.candidate
      });
      pc.addIceCandidate(candidate);
    } else if (message === 'bye' && isStarted) {
      handleRemoteHangup();
    } else if (message.type === 'text message') {
      handleIncomingText(message.body);
    } else if (message.type === 'avatar-assignment') {
      localAvatar = localAvatar || message.avatar;
      remoteAvatar = remoteAvatar || other(message.avatar);

      $('#local-avatar').addClass('avatar-' + localAvatar);
      $('#remote-avatar').addClass('avatar-' + remoteAvatar);
    }
  });

  function other(avatar) {
    if (avatar === 'cap') {
      return 'batman';
    }
    return 'cap';
  };

  ////////////////////////////////////////////////////

  var localVideo = document.querySelector('#local-video');
  var remoteVideo = document.querySelector('#remote-video');

  function handleUserMedia(stream) {
    console.log('Adding local stream.');
    localVideo.src = window.URL.createObjectURL(stream);
    localStream = stream;
    sendMessage('got user media');
    if (isInitiator) {
      maybeStart();
    }
  }

  function handleUserMediaError(error) {
    console.log('getUserMedia error: ', error);
  }

  var constraints = {
    video: true
  };
  getUserMedia(constraints, handleUserMedia, handleUserMediaError);

  console.log('Getting user media with constraints', constraints);

  if (location.hostname !== 'localhost') {
    requestTurn(
      'https://computeengineondemand.appspot.com/turn?username=41784574&key=4080218913'
    );
  }

  function maybeStart() {
    console.log('>>>>>>> maybeStart() ', isStarted, localStream, isChannelReady);
    if (!isStarted && typeof localStream !== 'undefined' && isChannelReady) {
      console.log('>>>>>> creating peer connection');
      createPeerConnection();
      pc.addStream(localStream);
      isStarted = true;
      console.log('isInitiator', isInitiator);
      if (isInitiator) {
        doCall();
      }
    }
  }

  window.onbeforeunload = function() {
    sendMessage('bye');
  };

  /////////////////////////////////////////////////////////

  function createPeerConnection() {
    console.log('Creating peer connection');
    try {
      pc = new RTCPeerConnection(null);
      pc.onicecandidate = handleIceCandidate;
      pc.onaddstream = handleRemoteStreamAdded;
      pc.onremovestream = handleRemoteStreamRemoved;
      console.log('Created RTCPeerConnnection');
    } catch (e) {
      console.log('Failed to create PeerConnection, exception: ' + e.message);
      alert('Cannot create RTCPeerConnection object.');
      return;
    }
  }

  function handleIceCandidate(event) {
    console.log('icecandidate event: ', event);
    if (event.candidate) {
      sendMessage({
        type: 'candidate',
        label: event.candidate.sdpMLineIndex,
        id: event.candidate.sdpMid,
        candidate: event.candidate.candidate
      });
    } else {
      console.log('End of candidates.');
    }
  }

  function handleCreateOfferError(event) {
    console.log('createOffer() error: ', event);
  }

  function doCall() {
    console.log('Sending offer to peer');
    pc.createOffer(setLocalAndSendMessage, handleCreateOfferError);
  }

  function doAnswer() {
    console.log('Sending answer to peer.');
    pc.createAnswer(setLocalAndSendMessage, null, sdpConstraints);
  }

  function setLocalAndSendMessage(sessionDescription) {
    // Set Opus as the preferred codec in SDP if Opus is present.
    sessionDescription.sdp = preferOpus(sessionDescription.sdp);
    pc.setLocalDescription(sessionDescription);
    console.log('setLocalAndSendMessage sending message', sessionDescription);
    sendMessage(sessionDescription);
  }

  function requestTurn(turnURL) {
    var turnExists = false;
    for (var i in pcConfig.iceServers) {
      if (pcConfig.iceServers[i].url.substr(0, 5) === 'turn:') {
        turnExists = true;
        turnReady = true;
        break;
      }
    }

    if (!turnExists) {
      console.log('Getting TURN server from ', turnURL);
      // No TURN server. Get one from computeengineondemand.appspot.com:
      var xhr = new XMLHttpRequest();
      xhr.onreadystatechange = function() {
        if (xhr.readyState === 4 && xhr.status === 200) {
          var turnServer = JSON.parse(xhr.responseText);
          console.log('Got TURN server: ', turnServer);
          pcConfig.iceServers.push({
            'url': 'turn:' + turnServer.username + '@' + turnServer.turn,
            'credential': turnServer.password
          });
          turnReady = true;
        }
      };
      xhr.open('GET', turnURL, true);
      xhr.send();
    }
  }

  this.sendText = function() {
    var messageBody = $outgoingText.val();
    $outgoingText.value = '';

    var message = { 'type': 'text message', 'body': messageBody };
    $textHistory.append('<li class=message-' + localAvatar + '>' + messageBody + '</li>');
    $textHistory.parent().scrollTop($textHistory[0].scrollHeight);
    sendMessage(message);
  }

  function handleIncomingText(message) {
    $textHistory.append('<li class=message-' + remoteAvatar + '>' + message + '</li>');
    $textHistory.parent().scrollTop($textHistory[0].scrollHeight);
  }

  function handleRemoteStreamAdded(event) {
    console.log('Remote stream added.');
    remoteVideo.src = window.URL.createObjectURL(event.stream);
    remoteStream = event.stream;

    $('#remote-video').removeClass('hidden');
    $('.remote-buttons').removeClass('hidden');
    $('#textchat').removeClass('hidden');

    var avatarMessage = { 'type': 'avatar-assignment', 'avatar': remoteAvatar };
    sendMessage(avatarMessage);
  }

  function handleRemoteStreamRemoved(event) {
    console.log('Remote stream removed. Event: ', event);
  }

  function hangup() {
    console.log('Hanging up.');
    stop();
    sendMessage('Bye');
  }

  function handleRemoteHangup() {
    console.log('Session terminated.');
    stop();
    isInitiator = true;
    $('#remote-video').addClass('hidden');
    $('.remote-buttons').addClass('hidden');
    $('#textchat').addClass('hidden');
  }

  function stop() {
    isStarted = false;
    // isAudioMuted = false;
    // isVideoMuted = false;
    pc.close();
    pc = null;
  }

  ///////////////////////////////////////////

  // Set Opus as the default audio codec if it's present.
  function preferOpus(sdp) {
    var sdpLines = sdp.split('\r\n');
    var mLineIndex = null;
    // Search for m line.
    for (var i = 0; i < sdpLines.length; i++) {
      if (sdpLines[i].search('m=audio') !== -1) {
        mLineIndex = i;
        console.log('mlineindex ' + i);
        break;
      }
    }
    console.log('mlineindex2: ' + mLineIndex);
    console.log(mLineIndex == null);
    if (mLineIndex == null) {
      return sdp;
    }

    // If Opus is available, set it as the default in m line.
    for (i = 0; i < sdpLines.length; i++) {
      if (sdpLines[i].search('opus/48000') !== -1) {
        var opusPayload = extractSdp(sdpLines[i], /:(\d+) opus\/48000/i);
        if (opusPayload) {
          sdpLines[mLineIndex] = setDefaultCodec(sdpLines[mLineIndex],
              opusPayload);
        }
        break;
      }
    }

    console.log('Before call');
    // Remove CN in m line and sdp.
    sdpLines = removeCN(sdpLines, mLineIndex);

    sdp = sdpLines.join('\r\n');
    return sdp;
  }

  function extractSdp(sdpLine, pattern) {
    var result = sdpLine.match(pattern);
    return result && result.length === 2 ? result[1] : null;
  }

  // Set the selected codec to the first in m line.
  function setDefaultCodec(mLine, payload) {
    var elements = mLine.split(' ');
    var newLine = [];
    var index = 0;
    for (var i = 0; i < elements.length; i++) {
      if (index === 3) { // Format of media starts from the fourth.
        newLine[index++] = payload; // Put target payload to the first.
      }

      if (elements[i] !== payload) {
        newLine[index++] = elements[i];
      }
    }
    return newLine.join(' ');
  }

  // Strip CN from sdp before CN constraints is ready.
  function removeCN(sdpLines, mLineIndex) {
    console.log('sdplines: ' + sdpLines);
    console.log('mLineIndex ' + mLineIndex);

    var mLineElements = sdpLines[mLineIndex].split(' ');
    // Scan from end for the convenience of removing an item.
    for (var i = sdpLines.length - 1; i >= 0; i--) {
      var payload = extractSdp(sdpLines[i], /a=rtpmap:(\d+) CN\/\d+/i);
      if (payload) {
        var cnPos = mLineElements.indexOf(payload);
        if (cnPos !== -1) {
          // Remove CN payload from m line.
          mLineElements.splice(cnPos, 1);
        }
        // Remove CN line in sdp
        sdpLines.splice(i, 1);
      }
    }

    sdpLines[mLineIndex] = mLineElements.join(' ');
    return sdpLines;
  }
};
