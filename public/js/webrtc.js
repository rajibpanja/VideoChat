var localVideo;
var firstPerson = false;
var socketCount = 0;
var socketId;
var localStream;
var connections = [];
var socket;
var remoteStream;

var peerConnectionConfig = {
  iceServers: [
    { urls: "stun:stun.services.mozilla.com" },
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
};

//Initialize the Form
function init() {
  document.querySelector("#hangupBtn").addEventListener("click", hangUp);
  document.querySelector("#joinBtn").addEventListener("click", openUserMedia);
  document.querySelector("#volume_off").addEventListener("click", volume_off);
  document.querySelector("#volume_up").addEventListener("click", volume_up);
  document.querySelector("#videocam").addEventListener("click", videocam);
  document.querySelector("#videocam_off").addEventListener("click", videocam_off);

  window.addEventListener('resize', resizeVideoTiles);
}

//Close conference from your browser
function hangUp() {
  connections.forEach(function (socketListId) {
    if (connections[socketListId] != null) {
      connections[socketListId].close();
    }
  });
  if (socket != null) socket.close();
  location.reload();
}

//Open Microphone and Camera from your browser
async function openUserMedia(e) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true,
  });

  localStream = stream;
  remoteStream = new MediaStream();
  document.querySelector("#self-video").srcObject = stream;
  document.querySelector("#videocam").classList.add('d-none');
  document.querySelector("#videocam_off").classList.remove('d-none');
  document.querySelector("#volume_up").classList.add('d-none');
  document.querySelector("#volume_off").classList.remove('d-none');
  document.querySelector("#hangupBtn").classList.remove('d-none');
  document.querySelector("#joinBtn").classList.add('d-none');

  //Join conferecne call and send the peer connection details to other participent via SOCKET request
  joinRoom();
  resizeVideoTiles();
}

function joinRoom() {

  document.querySelector("#hangupBtn").disabled = false;
  document.querySelector("#joinBtn").disabled = true;
  document.querySelector("#volume_off").disabled = false;

  //connecting socket check config file for socket server URL
  socket = io.connect(config.host, { secure: true });
  socket.on("connect", function () {
    socketId = socket.id;

    //Remove video element from your browser if received userleft emit from socekt server
    socket.on("user-left", function (id) {
      var video = document.querySelector('[data-socket="' + id + '"]');
      var parentDiv = video.parentElement;
      video.parentElement.parentElement.removeChild(parentDiv);

      resizeVideoTiles();
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
          connections[id].setLocalDescription(description).then(function () {
            socket.emit("signal", id, JSON.stringify({ sdp: connections[id].localDescription }));
          }).catch((e) => console.log(e));
        });
      }
    });
    ///////////////////////////////////////USER JOINED EVENT CLOSED//////////////////////////////////////////////////////////////////////////

  });
  //Getting socket messages from PEER
  socket.on("signal", gotMessageFromServer);
}

function gotRemoteStream(event, id) {

  console.log('got remote stream');
  var video = document.createElement("video");
  var div = document.createElement("div");
  div.classList.add("video-container", "pr-1", "pb-1");

  video.setAttribute("data-socket", id);
  if (event.stream != null) {
    video.srcObject = event.stream;
    video.classList.add('d-block', 'w-100', 'h-100');
  }
  video.autoplay = true;
  video.muted = false;
  video.playsinline = true;
  div.appendChild(video);
  document.getElementById("video-panel").appendChild(div);

  resizeVideoTiles();
}

function resizeVideoTiles() {
  const tileElms = document.querySelectorAll('.video-container');
  if (tileElms) {
    const availWidth = document.querySelector('#video-panel-container').clientWidth;
    const availHeight = document.querySelector('#video-panel-container').clientHeight;
    const maxTilesPerRow = Math.ceil(Math.sqrt(tileElms.length));
    const maxRows = Math.ceil(tileElms.length / maxTilesPerRow);
    const evalTileWidth = availWidth / maxTilesPerRow, evalTileHeight = availHeight / maxRows;
    const aspectTileWidth = evalTileHeight * 4 / 3; //(4:3 aspect ratio)
    let targetTileWidth = aspectTileWidth, targetTileHeight = evalTileHeight;
    if (aspectTileWidth > evalTileWidth) {
      targetTileWidth = evalTileWidth;
      targetTileHeight = evalTileHeight - ((aspectTileWidth - evalTileWidth) * 3 / 4); //(4:3 aspect ratio)
    }
    tileElms.forEach(tileElm => {
      tileElm.style.width = targetTileWidth + 'px';
      tileElm.style.height = targetTileHeight + 'px';
    });
  }
}

function gotMessageFromServer(fromId, message) {
  console.log("got message from server");
  //Parse the incoming signal
  var signal = JSON.parse(message);

  //Make sure it's not coming from yourself
  if (fromId != socketId) {
    if (signal.sdp) {
      connections[fromId]
        .setRemoteDescription(new RTCSessionDescription(signal.sdp))
        .then(function () {
          if (signal.sdp.type == "offer") {
            connections[fromId].createAnswer().then(function (description) {
              connections[fromId].setLocalDescription(description)
                .then(function () {
                  socket.emit("signal", fromId, JSON.stringify({ sdp: connections[fromId].localDescription }));
                }).catch((e) => console.log(e));
            }).catch((e) => console.log(e));
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
  document.querySelector("#volume_up").classList.remove('d-none');
  document.querySelector("#volume_off").classList.add('d-none');
}

function volume_up() {
  document.getElementById("self-video").muted = false;
  localStream.getAudioTracks()[0].enabled = true;
  document.querySelector("#volume_up").classList.add('d-none');
  document.querySelector("#volume_off").classList.remove('d-none');
}

function videocam_off() {
  localStream.getVideoTracks()[0].enabled = false;
  document.querySelector("#videocam").classList.remove('d-none');
  document.querySelector("#videocam_off").classList.add('d-none');
}

function videocam() {
  document.querySelector("#videocam").classList.add('d-none');
  document.querySelector("#videocam_off").classList.remove('d-none');
  localStream.getVideoTracks()[0].enabled = true;
}

init();
