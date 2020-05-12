var localVideo;
var firstPerson = false;
var socketCount = 0;
var socketId;
var localStream;
var connections = [];
var socket;
var remoteStream;
var room = 0;
var joinUserlist = []; //for chatting purpose

//STUN server for relay
var peerConnectionConfig = {
  iceServers: [
    { urls: "stun:stun.services.mozilla.com" },
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
};

window.onload = async () => {
  const queryRoom = getQueryVariable('room');
  room = queryRoom || 0;

  const homeScreen = document.querySelector('#home-screen');
  const videoScreen = document.querySelector('#video-screen');
  const roomUrl = document.querySelector('#room-url');
  const roomId = document.querySelector('#room-id');

  if (!room) {
    homeScreen.classList.remove('d-none');
    videoScreen.classList.add('d-none');
  } else {
    roomUrl.innerHTML = location.href;
    roomId.innerHTML = room;
    homeScreen.classList.add('d-none');
    videoScreen.classList.remove('d-none');

    await openUserMedia();
    joinRoom(room);
  }
}

function getQueryVariable(variable) {
  var query = window.location.search.substring(1);
  var vars = query.split('&');
  for (var i = 0; i < vars.length; i++) {
    var pair = vars[i].split('=');
    if (decodeURIComponent(pair[0]) == variable) {
      return decodeURIComponent(pair[1]);
    }
  }
  console.log('Query variable %s not found', variable);
}

//Initialize the Form
function init() {
  document.querySelector("#hangupBtn").addEventListener("click", hangUp);
  document.querySelector("#volume_off").addEventListener("click", volume_off);
  document.querySelector("#volume_up").addEventListener("click", volume_up);
  document.querySelector("#videocam").addEventListener("click", videocam);
  document.querySelector("#videocam_off").addEventListener("click", videocam_off);
  window.addEventListener("resize", resizeVideoTiles);
  //////////////////////////////CHAT IMPLEMENTATION CONTROL REGISTRATION///////////////////////////////


  //////////////////////////////////////////////////////////////////////////////////////////////////
}

function roomJoin(e) {
  e.preventDefault();
  const joinRoomInput = document.querySelector('#join-room-input');
  const roomInputErr = document.querySelector('#room-input-error');
  const roomNumber = joinRoomInput.value.toString();
  if (roomNumber) {
    roomInputErr.classList.remove('d-block');
    location.href = `${location.origin + location.pathname + '?room=' + roomNumber}`;
  } else {
    roomInputErr.innerHTML = 'Enter a room number to join.';
    roomInputErr.classList.add('d-block');
  }
}

function copyRoomToClipboard(selector) {
  var range = document.createRange();
  range.selectNode(document.getElementById(selector));
  window.getSelection().removeAllRanges(); // clear current selection
  window.getSelection().addRange(range); // to select text
  document.execCommand("copy");
  window.getSelection().removeAllRanges();// to deselect
}

//Close conference from your browser
function hangUp() {
  connections.forEach(function (socketListId) {
    if (connections[socketListId] != null) {
      connections[socketListId].close();
    }
  });
  if (socket != null) socket.close();

  location.href = location.origin + location.pathname;
}

//Open Microphone and Camera from your browser
async function openUserMedia(e) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true,
  });
  localStream = stream;
  remoteStream = new MediaStream();
  const selfVideoElm = document.querySelector("#self-video");
  selfVideoElm.srcObject = stream;
  document.querySelector("#videocam").classList.add("d-none");
  document.querySelector("#videocam_off").classList.remove("d-none");
  document.querySelector("#volume_up").classList.add("d-none");
  document.querySelector("#volume_off").classList.remove("d-none");
  document.querySelector("#hangupBtn").classList.remove("d-none");

  //Join conferecne call and send the peer connection details to other participent via SOCKET request
  selfVideoElm.onloadeddata = () => {
    resizeVideoTiles();
  };
}

function createRoom() {
  //connecting socket check config file for socket server URL
  socket = io.connect(config.host, { secure: true });
  socket.on("connect", function () {
    socket.emit("RoomCreate");
    socket.on("RoomNumber", function (roomNumber) {
      location.href = `${location.origin + location.pathname + '?room=' + roomNumber}`;
    });
  });
}

function joinRoom(roomNumber) {
  document.querySelector("#hangupBtn").disabled = false;
  document.querySelector("#volume_off").disabled = false;

  //connecting socket check config file for socket server URL
  socket = io.connect(config.host, { secure: true });
  socket.on("connect", function () {
    socketId = socket.id;
    //Join the room
    socket.emit("joinroom", roomNumber);
    //Share name with other room member
    socket.emit("nameshare", roomNumber, "name");
    //Populate  join userdetails from SOCKET IO
    socket.on("joinusername", (usrname, socketid) => {
      var obj = { name: usrname, sid: socketid };
      joinUserlist.push(obj);
    });

    //Remove video element from your browser if received userleft emit from socket server
    socket.on("user-left", function (id) {
      var video = document.querySelector('[data-socket="' + id + '"]');
      if (video != null) {
        var parentDiv = video.parentElement;
        video.parentElement.parentElement.removeChild(parentDiv);
        resizeVideoTiles();
      }
      //Remove user from userlist array
      removeUser(id);
    });
    ////////////////////////////////////////////////////////////////////////////////////////
    //When user joined received this event from socket server along with soketid of new joinee and list
    //When user joined received this event from socket server along with soketid of new joinee and list
    // of all socket client
    socket.on("user-joined", function (id, count, clients) {
      clients.forEach(function (socketListId) {
        if (!connections[socketListId]) {
          connections[socketListId] = new RTCPeerConnection(
            peerConnectionConfig
          );

          //Adding local video and audio track to all the clients peer connections
          localStream.getTracks().forEach((track) => {
            connections[socketListId].addTrack(track, localStream);
          });

          //Wait for their ice candidate for establishing the peer connection
          connections[socketListId].onicecandidate = function (event) {
            if (event.candidate != null) {
              console.log("SENDING ICE");
              socket.emit(
                "signal",
                socketListId,
                JSON.stringify({ ice: event.candidate })
              );
            }
          };

          // Register event for video stream
          connections[socketListId].onaddstream = function () {
            gotRemoteStream(event, socketListId);
          };
        }
      });

      //Create an offer to connect with your browser
      //when the connection established between two browser
      if (count >= 2) {
        connections[id].createOffer().then(function (description) {
          connections[id]
            .setLocalDescription(description)
            .then(function () {
              socket.emit(
                "signal",
                id,
                JSON.stringify({ sdp: connections[id].localDescription })
              );
            })
            .catch((e) => console.log(e));
        });
      }
    });
    ///////////////////////////////////////USER JOINED EVENT CLOSED//////////////////////////////////////////////////////////////////////////
  });


  //Getting socket multimedia related messages from PEER
  socket.on("signal", gotMessageFromServer);

  //Receive chat message
  socket.on("receivedmessage", (message) => {
    console.log(message);
    //Populate message in chat window

  });
}

function gotRemoteStream(event, id) {
  console.log("got remote stream");
  var video = document.createElement("video");
  var div = document.createElement("div");
  div.classList.add("video-tile", "p-1");

  video.setAttribute("data-socket", id);
  if (event.stream != null) {
    video.srcObject = event.stream;
    video.classList.add("d-block", "w-100", "h-100");
  }
  video.setAttribute("autoplay", true);
  video.removeAttribute("muted");
  video.setAttribute("playsinline", true);
  div.appendChild(video);
  document.getElementById("video-panel").appendChild(div);

  video.onloadeddata = (e) => {
    e.target.play();
    resizeVideoTiles();
  };
}

function resizeVideoTiles() {
  const tileElms = document.querySelectorAll('.video-tile');
  if (tileElms) {
    const
      availWidth = document.querySelector('#video-panel-container').clientWidth,
      availHeight = document.querySelector('#video-panel-container').clientHeight,
      maxTilesPerRow = Math.ceil(Math.sqrt(tileElms.length)), maxRows = Math.ceil(tileElms.length / maxTilesPerRow),
      evalTileWidth = availWidth / maxTilesPerRow, evalTileHeight = availHeight / maxRows;
    let targetTileWidth = 0, targetTileHeight = 0, renderedTileMinHeight = 0;
    tileElms.forEach(tileElm => {
      const
        videoElm = tileElm.querySelector('video'),
        aspectRatio = videoElm.videoWidth / videoElm.videoHeight;
      if (aspectRatio > 1) {
        if (evalTileHeight < evalTileWidth / aspectRatio) {
          targetTileHeight = evalTileHeight;
          targetTileWidth = evalTileHeight * aspectRatio;
        } else {
          targetTileWidth = evalTileWidth;
          targetTileHeight = evalTileWidth / aspectRatio;
        }
      } else {
        if (evalTileWidth < evalTileHeight * aspectRatio) {
          targetTileWidth = evalTileWidth;
          targetTileHeight = evalTileWidth / aspectRatio;
        } else {
          targetTileHeight = evalTileHeight;
          targetTileWidth = evalTileHeight * aspectRatio;
        }
      }
      tileElm.style.width = targetTileWidth + 'px';
      tileElm.style.height = targetTileHeight + 'px';
      if (!renderedTileMinHeight || renderedTileMinHeight > targetTileHeight) {
        renderedTileMinHeight = Math.floor(targetTileHeight);
      }
    });
    tileElms.forEach(tileElm => {
      const tileHeight = tileElm.offsetHeight;
      if (tileHeight > renderedTileMinHeight) {
        const
          videoElm = tileElm.querySelector('video'),
          aspectRatio = videoElm.videoWidth / videoElm.videoHeight;
        let targetTileWidth = renderedTileMinHeight * aspectRatio;
        tileElm.style.width = targetTileWidth + 'px';
        tileElm.style.height = renderedTileMinHeight + 'px';
      }
    });
  }
}

function gotMessageFromServer(fromId, message) {
  console.log("got message from server");
  //Parse the incoming signal
  var signal = JSON.parse(message);

  //Make sure it's not coming from same browser
  if (fromId != socketId) {
    if (signal.sdp) {
      connections[fromId]
        .setRemoteDescription(new RTCSessionDescription(signal.sdp))
        .then(function () {
          if (signal.sdp.type == "offer") {
            connections[fromId]
              .createAnswer()
              .then(function (description) {
                connections[fromId]
                  .setLocalDescription(description)
                  .then(function () {
                    socket.emit(
                      "signal",
                      fromId,
                      JSON.stringify({
                        sdp: connections[fromId].localDescription,
                      })
                    );
                  })
                  .catch((e) => console.log(e));
              })
              .catch((e) => console.log(e));
          }
        })
        .catch((e) => console.log(e));
    }

    if (signal.ice) {
      connections[fromId]
        .addIceCandidate(new RTCIceCandidate(signal.ice))
        .then()
        .catch((e) => console.log(e));
    }
  }
}

function volume_off() {
  localStream.getAudioTracks()[0].enabled = false;
  document.querySelector("#volume_up").classList.remove("d-none");
  document.querySelector("#volume_off").classList.add("d-none");
}

function volume_up() {
  // document.getElementById("self-video").muted = false;
  localStream.getAudioTracks()[0].enabled = true;
  document.querySelector("#volume_up").classList.add("d-none");
  document.querySelector("#volume_off").classList.remove("d-none");
}

function videocam_off() {
  localStream.getVideoTracks()[0].enabled = false;
  document.querySelector("#videocam").classList.remove("d-none");
  document.querySelector("#videocam_off").classList.add("d-none");
}

function videocam() {
  document.querySelector("#videocam").classList.add("d-none");
  document.querySelector("#videocam_off").classList.remove("d-none");
  localStream.getVideoTracks()[0].enabled = true;
}

init();

//Remove user from room
function removeUser(userSocketID) {
  // joinUserlist.forEach(item,())
  // var index = arr.indexOf(value);
  // if (index > -1) {
  //     arr.splice(index, 1);
  // }
  // return arr;
}

//Chat message sending feature
function sendMessage() {
  // var message = messageInputBox.value;
  // socket.emit("messagetoAll", document.getElementById('tbxroomid').value, message);
  // messageInputBox.value = "";
  // messageInputBox.focus();

}


