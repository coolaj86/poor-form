/*jshint strict:true node:true es5:true onevar:true laxcomma:true laxbreak:true eqeqeq:true immed:true latedef:true*/
(function () {
  "use strict";

  var walk = require('walk')
    , request = require('ahr2')
    , fs = require('fs')
    , path = require('path')
    , FormData = require('FormData')
    , File = require('File')
    , CryptoStream = require('./cryptostream')
    , walker
    , pathname = process.argv[2]
    , queue = [] 
    ;

  //crypto.randomBytes(size, [callback])
  if (!pathname) {
    console.error('Usage: node md5sum-test /path/to/test');
    return;
  }

/*
{
  "success": true,
  "result": [
    {
      "content-disposition": "form-data; name=\"md5sum-test.js\"; filename=\"md5sum-test.js\"",
      "content-type": "application/javascript",
      "name": "md5sum-test.js",
      "filename": "md5sum-test.js",
      "type": "application/javascript",
      "md5sum": "a522fab6fe2a6b1b5b20fe0a6eb56c51"
    }
  ]
}
 */

  function handleQueue(next, queue) {
    var form = new FormData()
      , curQueue
      , origQueue = queue.slice()
      , goodCount = 0
      ;

    curQueue = queue.splice(0);
    curQueue.forEach(function (f) {
      form.append(f.stat.name, new File(path.join(f.root, f.stat.name)));
    });

    request.post('http://localhost:4444/dummy', null, form).when(function (err, ahr2, data) {
      try {
        data = JSON.parse(data.toString('utf8')).result;
      } catch(e) {
        console.error('Request could not be parsed as JSON');
        console.error(data.toString('utf8'));
        return;
      }

      data.every(function (r) {
        var excellent = false
          ;

        // NOTE: technically two files could have the same name but be different files
        //obj.root, obj.stat, obj.md5
        excellent = curQueue.some(function (l, i) {
          if (l.stat.name === r.filename && l.md5 === r.md5sum) {
            curQueue.splice(i, 1);
            return true;
          }
        });

        if (excellent) {
          goodCount += 1;
          return true;
        }
      });

      if (goodCount === data.length && 0 === queue.length) {
        next();
        return;
      }

      console.error(data);
      console.error(origQueue);
      throw new Error('Major Badness');
    });
  }

  walker = walk.walk(pathname);
  walker.on('file', function (root, stat, next) {
    var filepath = path.join(root, stat.name)
      , rs = fs.createReadStream(filepath)
      , cs = CryptoStream.create('md5')
      ;

    // TODO allow FormData to md5sum files with arbitrary filter
    rs.pipe(cs);
    cs.on('end', function () {
      console.log(filepath, cs.digest);
      queue.push({ root: root, stat: stat, md5: cs.digest});
      if (3 === queue.length) {
        handleQueue(next, queue);
      } else {
        next();
      }
    });
  });
  walker.on('end', function () {
    handleQueue(function () {
      console.log('The Eagle has Landed');
    }, queue);
  });
}());
