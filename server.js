const fs = require('fs')
var express = require('express')
var path = require('path')
var app = express()
var cors = require('cors')
var activeSockets = {}
var allowedOrigins = [
  'https://localhost:5000',
  'https://comino.herokuapp.com'
]

app.use(cors({
  origin: function(origin, callback){
    if(!origin) return callback(null, true)
    if(allowedOrigins.indexOf(origin) === -1){
      var msg = 'The CORS policy for this site does not ' +
                'allow access from the specified Origin.'
      return callback(new Error(msg), false)
    }
    return callback(null, true)
  }
}))

app.use(function(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*') // update to match the domain you will make the request from
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept')
  next()
})


const options = {
  key: fs.readFileSync('key.pem'),
  cert: fs.readFileSync('cert.pem')
}

if (process.env.SSL) {
  var http = require('https').Server(options, app)
} else {
  var http = require('http').Server(app)
}

var io = require('socket.io')(http, { origins: '*:*', pingInterval: 15000})

app.use(express.static(path.join(__dirname, 'public')))

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'))
})

app.get('/r/:room', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/room.html'))
})

io.on('connection', socket => {

  let room = socket.handshake.query.room

  if (!activeSockets[room]) {
    activeSockets[room] = []
  }

  const existingSocket = activeSockets[room].find(
    existingSocket => existingSocket === socket.id
  )

  if (!existingSocket) {
    activeSockets[room].push(socket.id)

    socket.emit("roomlist", {
      room: room,
      users: activeSockets[room].filter(
        existingSocket => existingSocket !== socket.id
      )
    })
  }

  socket.on('call', data => {
    console.log('call to: ' + data.to)
    console.log('call from: ' + socket.id)
    socket.to(data.to).emit('called', {
      offer: data.offer,
      socket: socket.id
    })
  })

  socket.on('answer', data => {
    console.log('answer to: ' + data.to)
    console.log('answer from: ' + socket.id)
    socket.to(data.to).emit('answered', {
      socket: socket.id,
      answer: data.answer
    })
  })

  socket.on('leave', data => {
    console.log('leave room ' + data.id)
    socket.emit('left', {
      room: room,
      id: data.id
    })
  }) 

  socket.on('disconnect', () => {
    console.log('disconnect: ' + socket.id)
    for(var room in activeSockets) {
      if (activeSockets[room].includes(socket.id)) {
        activeSockets[room] = activeSockets[room].filter(
          existingSocket => existingSocket !== socket.id
        )
        socket.emit('left', {
          room: room,
          id: socket.id
        })
      }
    }    
  })
})

var server = http.listen(process.env.PORT, function () { //run http and web socket server
  console.log(`Server running at http://localhost:${process.env.PORT}`)
})