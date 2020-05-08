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

function init() {
  document.querySelector("#cameraBtn").addEventListener("click", openUserMedia);
  document.querySelector("#hangupBtn").addEventListener("click", hangUp);
  document.querySelector("#joinBtn").addEventListener("click", joinRoom);
  document.querySelector("#volume_off").addEventListener("click", volume_off);
  document.querySelector("#volume_up").addEventListener("click", volume_up);
  document.querySelector("#videocam").addEventListener("click", videocam);
  document
    .querySelector("#videocam_off")
    .addEventListener("click", videocam_off);
}

async function openUserMedia(e) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true,
  });
  localStream = stream;
  remoteStream = new MediaStream();
  document.querySelector("#localVideo").srcObject = stream;
  document.querySelector("#cameraBtn").disabled = true;
  document.querySelector("#joinBtn").disabled = false;
  document.querySelector("#hangupBtn").disabled = false;
  document.querySelector("#videocam").disabled = true;
  document.querySelector("#videocam_off").disabled = false;
  document.querySelector("#volume_up").disabled = true;
  document.querySelector("#volume_off").disabled = false;
}
//close conference
function hangUp() {
  connections.forEach(function (socketListId) {
    if (connections[socketListId] != null) {
      connections[socketListId].close();
    }
  });
  if (socket != null) socket.close();
  location.reload();
}

function joinRoom() {
  document.querySelector("#hangupBtn").disabled = false;
  document.querySelector("#joinBtn").disabled = true;
  document.querySelector("#volume_off").disabled = false;
  socket = io.connect(config.host, { secure: true });
  socket.on("signal", gotMessageFromServer);
  socket.on("connect", function () {
    socketId = socket.id;
    socket.on("user-left", function (id) {
      var video = document.querySelector('[data-socket="' + id + '"]');
      var parentDiv = video.parentElement;
      video.parentElement.parentElement.removeChild(parentDiv);
    });

    socket.on("user-joined", function (id, count, clients) {
      clients.forEach(function (socketListId) {
        if (!connections[socketListId]) {
          connections[socketListId] = new RTCPeerConnection(
            peerConnectionConfig
          );

          localStream.getTracks().forEach((track) => {
            connections[socketListId].addTrack(track, localStream);
          });

          //Wait for their ice candidate
          connections[socketListId].onicecandidate = function () {
            if (event.candidate != null) {
              console.log("SENDING ICE");
              socket.emit(
                "signal",
                socketListId,
                JSON.stringify({ ice: event.candidate })
              );
            }
          };

          // Wait for their video stream
          connections[socketListId].onaddstream = function () {
            gotRemoteStream(event, socketListId);
          };
        }
      });

      //Create an offer to connect with your local description

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
  });
}

function gotRemoteStream(event, id) {
  var video = document.createElement("video");
  var div = document.createElement("div");
  div.classList.add("col-md-3");

  video.setAttribute("data-socket", id);
  video.srcObject = event.stream;
  video.autoplay = true;
  video.muted = false;
  video.playsinline = true;

  // if( event.stream.getAudioTracks().length > 0)
  // console.log(event.stream.getAudioTracks()[0].enabled);
  //  else
  // console.log('no audio');

  div.appendChild(video);
  console.log(document.getElementById("videoContainer"));
  document.getElementById("videoContainer").appendChild(div);
}

function gotMessageFromServer(fromId, message) {
  //Parse the incoming signal
  var signal = JSON.parse(message);

  //Make sure it's not coming from yourself
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
        .catch((e) => console.log(e));
    }
  }
}

function volume_off() {
  document.querySelector("#volume_up").disabled = false;
  document.querySelector("#volume_off").disabled = true;
  localStream.getAudioTracks()[0].enabled = false;
  
  // document.getElementById("localVideo").muted = true;
}

function volume_up() {
  document.querySelector("#volume_up").disabled = true;
  document.querySelector("#volume_off").disabled = false;
  document.getElementById("localVideo").muted = false;
  localStream.getAudioTracks()[0].enabled = true;
}

function videocam_off() {
  document.querySelector("#videocam").disabled = false;
  document.querySelector("#videocam_off").disabled = true;
  localStream.getVideoTracks()[0].enabled = false;
}

function videocam() {
  document.querySelector("#videocam").disabled = true;
  document.querySelector("#videocam_off").disabled = false;
  localStream.getVideoTracks()[0].enabled = true;
}

init();
