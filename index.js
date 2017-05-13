var request = require('request');
var cheerio = require('cheerio');
var AWS = require('aws-sdk');
var TelegramBot = require('node-telegram-bot-api');
var config = require('./config');

AWS.config.update({
  region: config.aws.region,
  accessKeyId: config.aws.accessKeyId,
  secretAccessKey: config.aws.secretAccessKey
});

var docClient = new AWS.DynamoDB.DocumentClient();
var telegram_bot_token = config.telegram.bot_token;
var bot = new TelegramBot(telegram_bot_token, { polling: false });
var jar = request.jar();
var login_url = 'http://www.lm-us.com/wp-login.php';

function login() {
  request.post({
    url: login_url,
    jar: jar,
    headers: { 'User-Agent': 'request' },
    form: { log: 'us06', pwd: '0000' }
  }, function(err, httpResponse, body) {
    var params = { TableName: "Dramas" };
    docClient.scan(params, onScanDramas);
  });
}

function onScanDramas(err, data) {
  if (err) {
    console.error("Unable to scan the table.");
  } else {
    data.Items.forEach(function(drama) {
      var index = data.Items.indexOf(drama);
      setTimeout(function() {
        checkNewEpisode(drama.name, drama.url, drama.episode_count);
      }, index * 2000);
    });
  }
}

function checkNewEpisode(name, url, episode_count) {
  request({
    url: url,
    jar: jar,
    headers: { 'User-Agent': 'request' },
    method: "GET"
  }, function(err, res, body) {
    if (err) {
      console.error("Unable to get request: " + url);
    } else {
      var $ = cheerio.load(body);
      var episodes = $('aside#related-posts-by-taxonomy-2').find('ul > li > a');
      if (episodes.length > episode_count) {
        var title = episodes.first().text();
        var link = episodes.first().attr('href');
        updateAndNotify(name, title, link, episodes.length);
      }
    }
  });
}

function updateAndNotify(name, title, link, episode_count) {
  bot.sendMessage(config.telegram.receiver_id, title + " - " + link);

  var params = {
    TableName: "Dramas",
    Key:{ "name": name },
    UpdateExpression: "set episode_count = :episode_count",
    ExpressionAttributeValues:{ ":episode_count": episode_count },
    ReturnValues:"UPDATED_NEW"
  };

  docClient.update(params, function(err, data) {
    if (err) console.error("Unable to update drama: " + name);
  });
}

exports.handler = (event, context, callback) => {
  login();
};
