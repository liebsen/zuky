let isAlreadyCalling = false
let getCalled = false
let existingCalls = []
let existingCall = false
let localStreamId = ''
let localSocketId = ''
let roomId = location.pathname.split('/').reverse()[0]
let videoSources = []
let alreadyCalled = []
const configuration {'iceServers': [{'urls': 'stun:stun.l.google.com:19302'}]}
const { RTCPeerConnection, RTCSessionDescription } = window
const peerConnection = new RTCPeerConnection(configuration)

function sanitizeStreamId(id) {
  return id.split('{').join('').split('}').join('').split('-').join('')
}

function unselectUsersFromList() {
  const alreadySelectedUser = document.querySelectorAll(
    '.active-user.active-user--selected'
  )

  alreadySelectedUser.forEach(el => {
    el.setAttribute('class', 'active-user')
  })
}

function createUserItemContainer(socketId) {
  const userContainerEl = document.createElement('div')

  const usernameEl = document.createElement('p')

  userContainerEl.setAttribute('class', 'active-user')
  userContainerEl.setAttribute('id', socketId)
  usernameEl.setAttribute('class', 'username')
  usernameEl.innerHTML = `Socket: ${socketId}`

  userContainerEl.appendChild(usernameEl)

  userContainerEl.addEventListener('click', () => {
    unselectUsersFromList()
    userContainerEl.setAttribute('class', 'active-user active-user--selected')
    const talkingWithInfo = document.getElementById('talking-with-info')
    talkingWithInfo.innerHTML = `Talking with: 'Socket: ${socketId}'`
    callUser(socketId)
  })

  return userContainerEl
}

function handleAudioLevel(stream) {
  var id = sanitizeStreamId(stream.id)
  var audioContext = new AudioContext()
  var microphone = audioContext.createMediaStreamSource(stream)
  var javascriptNode = audioContext.createScriptProcessor(1024, 1, 1)
  var max_level_L = 0
  var old_level_L = 0
  microphone.connect(javascriptNode)
  javascriptNode.connect(audioContext.destination)
  javascriptNode.onaudioprocess = function(event){

    var inpt_L = event.inputBuffer.getChannelData(0)
    var instant_L = 0.0

    var sum_L = 0.0
    for(var i = 0; i < inpt_L.length; ++i) {
      sum_L += inpt_L[i] * inpt_L[i]
    }
    instant_L = Math.sqrt(sum_L / inpt_L.length)
    max_level_L = Math.max(max_level_L, instant_L)       
    instant_L = Math.max( instant_L, old_level_L -0.008 )
    old_level_L = instant_L
    if (instant_L > 0.05) {
      if (id !== localStreamId) {
        if (document.querySelector('.is-audio-active')) {
          document.querySelector('.is-audio-active').classList.remove('is-audio-active')
        }
        if (document.getElementById(id)) {
          document.getElementById(id).classList.add('is-audio-active')
        }
      }
    }

    //cnvs_cntxt.clearRect(0, 0, cnvs.width, cnvs.height)
    //cnvs_cntxt.fillStyle = '#00ff00'
    //cnvs_cntxt.fillRect(10,10,(cnvs.width-20)*(instant_L/max_level_L),(cnvs.height-20)) // x,y,w,h
    
  }
}

function debug(text) {
  document.getElementById('debug').innerHTML = text + '\n' + document.getElementById('debug').innerHTML
}

function addVideoSource(stream, muted) {
  let id = sanitizeStreamId(stream.id)
  if (!document.getElementById(id)) {
    debug('stream: ' + id)
    var videoCont = document.createElement('div')
    videoCont.className = 'column is-2'
    videoCont.id = id

    var videoElem = document.createElement('video')
    videoElem.autoplay = true
    videoElem.muted = muted || false
    videoCont.appendChild(videoElem)
    videoElem.srcObject = stream
    handleAudioLevel(stream)
    return document.querySelector('.video-container').appendChild(videoCont)
  }
}

async function callUser(socketId) {
  debug('callUser: ' + socketId)
  const offer = await peerConnection.createOffer()
  // const offer = await peerConnection.createOffer()
  await peerConnection.setLocalDescription(new RTCSessionDescription(offer))

  socket.emit('call', {
    offer,
    to: socketId
  })
}

function startMediaDevices () {
  navigator.getUserMedia = ( navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia)
  navigator.getUserMedia(
    { video: true, audio: true },
    stream => {
      localStreamId = sanitizeStreamId(stream.id)
      addVideoSource(stream, true)
      socket.emit('stream', {
        room: roomId,
        socket: localSocketId,
        stream: localStreamId
      })
      stream.getTracks().forEach(track => peerConnection.addTrack(track, stream))
    },
    error => {
      console.warn(error.message)
    }
  )
}
const socket = io.connect('zuky.herokuapp.com', { query: `room=${roomId}` })
// const socket = io.connect('192.168.2.13:5000', { query: `room=${roomId}` })

socket.on('connect', function(data) {
  localSocketId = socket.id
  startMediaDevices()
})

socket.on('roomlist', data => {
  debug('roomlist')
  if (data.room === roomId) {
    debug(JSON.stringify(data.users))
    const activeUserContainer = document.getElementById('active-user-container')

    data.users.forEach(socketId => {
      if (!existingCalls.includes(socketId)) {
        existingCalls.push(socketId)
        setTimeout(() => {
          callUser(socketId)
        }, 3000)
      }
      const alreadyExistingUser = document.getElementById(socketId)
      if (!alreadyExistingUser) {
        const userContainerEl = createUserItemContainer(socketId)
        activeUserContainer.appendChild(userContainerEl)
      }
    })
  }
})

socket.on('remove-user', ({ socketId }) => {
  const elToRemove = document.getElementById(socketId)

  if (elToRemove) {
    elToRemove.remove()
  }
})

socket.on('called', async data => {
  debug('called: ' + data.socket)
  await peerConnection.setRemoteDescription(
    new RTCSessionDescription(data.offer)
  )
  const answer = await peerConnection.createAnswer()
  await peerConnection.setLocalDescription(new RTCSessionDescription(answer))

  socket.emit('answer', {
    answer,
    to: data.socket
  })
})

socket.on('answered', async data => {
  debug('answered: ' + data.socket)
  await peerConnection.setRemoteDescription(
    new RTCSessionDescription(data.answer)
  )
  if (!alreadyCalled.includes(data.socket)) {
    alreadyCalled.push(data.socket)
    callUser(data.socket)
  }
})

socket.on('left', data => {
  debug('left: ' + data.stream)
  if (document.getElementById(data.stream)) {
    debug('removed: ' + data.stream)
    document.getElementById(data.stream).remove()
  }
})

peerConnection.ontrack = function({ streams: [stream] }) {
  addVideoSource(stream)
}

window.onbeforeunload = () => {
  socket.emit('leave', {
    room: roomId,
    stream: localStreamId
  })
}

window.onerror = function (msg, url, lineNo, columnNo, error) {
  debug('error: ' + msg)
}