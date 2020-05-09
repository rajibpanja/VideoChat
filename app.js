const express = require('express');
const routes = require('routes');
const http = require("http");
const socketio = require("socket.io");
const path = require('path');
const port = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const io = socketio(server);

// public folder access
const publicDirectoryPath = path.join(__dirname, './public')
app.use(express.static(publicDirectoryPath))

//Socket connection chalu 
io.on('connection', function(socket){
	
	console.log('Socket connected:- ' + socket.id)
	
	io.sockets.emit("user-joined", socket.id, io.engine.clientsCount, Object.keys(io.sockets.clients().sockets));
     
	socket.on('signal', (toId, message) => {
		io.to(toId).emit('signal', socket.id, message);
  	});

    socket.on("message", function(data){
		io.sockets.emit("broadcast-message", socket.id, data);
    })

	//When client disconnect send the signal to other participent with disconnected client's socketid via user-left event
	socket.on('disconnect', function() {
		io.sockets.emit("user-left", socket.id);
	})
});

server.listen(port, () => {
	console.log("Server is up on port " + port);
  });