const bodyParser = require('body-parser')
const express = require('express')
const request = require('request')
const crypto = require('crypto')

const APP_SECRET = process.env.MESSENGER_APP_SECRET
const VALIDATION_TOKEN = process.env.MESSENGER_VALIDATION_TOKEN
const PAGE_ACCESS_TOKEN = process.env.MESSENGER_PAGE_ACCESS_TOKEN

var app = express()
app.set('port', process.env.PORT || 5000)
app.use(bodyParser.json({ verify: verifyRequestSignature }))


// Check status
app.get('/status', function(req, res) {
  console.log("GET /status")
  res.send('status: ok')
})

// Verify webhook
app.get('/webhook', function (req, res) {
  console.log("GET /webhook")
  if (req.query['hub.verify_token'] === VALIDATION_TOKEN) {
    res.send(req.query['hub.challenge']);
  } else {
    res.send('Error, wrong validation token');
  }
})

// Received webhook
app.post('/webhook', function (req, res) {
  var data = req.body;

  console.log("POST /webhook")
  if (data.object == 'page') {
    data.entry.forEach(function(pageEntry) {
      var pageID = pageEntry.id;
      var timeOfEvent = pageEntry.time;

      pageEntry.messaging.forEach(function(messagingEvent) {
        if (messagingEvent.message) {
          receivedMessage(messagingEvent);
        } else if (messagingEvent.delivery) {
          receivedDeliveryConfirmation(messagingEvent);
        } else if (messagingEvent.postback) {
          receivedPostback(messagingEvent);
        } else {
          console.log("Webhook received with unknown messagingEvent: ", messagingEvent);
        }
      });
    });
    res.sendStatus(200);
  }
})

function receivedMessage(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfMessage = event.timestamp;
  var message = event.message;

  console.log("Received message for user %d and page %d at %d with message:",
      senderID, recipientID, timeOfMessage);
  console.log(JSON.stringify(message));

  var messageId = message.mid;

  // You may get a text or attachment but not both
  var messageText = message.text;
  var messageAttachments = message.attachments;

  let lookupTable = {
    hey: sendGenericMessage,
    defaults: sendTextMessage
  }

  if (messageText) {
    let action = lookupTable[messageText] || lookupTable['defaults']
    action(senderID, messageText)
  }
}

function sendTextMessage(recipientId, messageText) {
  var messageData = {
    recipient: { id: recipientId },
    message: { text: messageText }
  };

  callSendAPI(messageData);
}

const CALL_ADMIN_PAYLOAD = "CALL_ADMIN_PAYLOAD"

function customPayloadButton(){
  var createWebButton= (type, title, url) => ({type, title, url})
  var createPostbackButton = (type, title, payload) => ({type, title, payload})

  var buttons = [
    createWebButton("web_url", "Open FanPage", "https://www.facebook.com/psuregisalert"),
    createPostbackButton("postback", "Call Admin", CALL_ADMIN_PAYLOAD)
  ]

  var payload = {
    template_type: "button",
    text: "What do you want to do next?",
    buttons: buttons
  }

  return payload
}

function sendGenericMessage(recipientId) {
  var payload = customPayloadButton()
  var messageData = {
    recipient: { id: recipientId },
    message: {
      attachment: {
        type: "template",
        payload: payload
      }
    }
  };

  callSendAPI(messageData);
}

function receivedPostback(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfPostback = event.timestamp;

  // The 'payload' param is a developer-defined field which is set in a postback
  // button for Structured Messages.
  var payload = event.postback.payload;

  console.log("Received postback for user %d and page %d with payload '%s' " +
      "at %d", senderID, recipientID, payload, timeOfPostback);

  // When a postback is called, we'll send a message back to the sender to
  // let them know it was successful
  sendTextMessage(senderID, "Postback called");
}

function verifyRequestSignature(req, res, buf) {
  var signature = req.headers["x-hub-signature"];

  if (!signature) {
    // For testing, let's log an error. In production, you should throw an
    // error.
    console.error("Couldn't validate the signature.");
  } else {
    var elements = signature.split('=');
    var method = elements[0];
    var signatureHash = elements[1];

    var expectedHash = crypto.createHmac('sha1', APP_SECRET).update(buf)
                        .digest('hex');

    if (signatureHash != expectedHash) {
      throw new Error("Couldn't validate the request signature.");
    }
  }
}


function callSendAPI(messageData) {
  request({
    uri: 'https://graph.facebook.com/v2.6/me/messages',
    qs: { access_token: PAGE_ACCESS_TOKEN },
    method: 'POST',
    json: messageData

  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var recipientId = body.recipient_id;
      var messageId = body.message_id;

      console.log("Successfully sent generic message with id %s to recipient %s",
          messageId, recipientId);
    } else {
      console.error("Unable to send message.");
      console.error(response);
      console.error(error);
    }
  });
}

function receivedDeliveryConfirmation(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var delivery = event.delivery;
  var messageIDs = delivery.mids;
  var watermark = delivery.watermark;
  var sequenceNumber = delivery.seq;

  if (messageIDs) {
    messageIDs.forEach(function(messageID) {
      console.log("Received delivery confirmation for message ID: %s",
          messageID);
    });
  }

  console.log("All message before %d were delivered.", watermark);
}

app.listen(app.get('port'), function() {
  console.log('Node app is running on port', app.get('port'));
});

module.exports = app;
