QuickParser
===

This searches through any chunk of data to find the start of a boundary.

If it finds a start, but not an end then you should concatonate with the
next chunk and run again to determine the full boundary.

```javascript
var QuickParser = require('poor-form').QuickParser
  , boundBuffer
  , quickParser
  , contentType
  , match
  , boundString
  , boundBuffer
  ;

contentType = request.headers['content-type'];
if (!contentType) {
  response.end('Bad Form: No Content-Type declared');
  return;
}

match = contentType.match(/boundary=([^;]+)/i);
if (!match) {
  response.end('Bad Form: No boundary declared in Content-Type');
  return;
}

boundString = match[1];
boundBuffer = new Buffer('--' + boundString);
quickParser = new QuickParser(boundBuffer)

request.on('data', function (chunk) {
  results = quickParser.parse(chunk);
  console.log(results);
  // i.e. { start: 0, finish: 126 }
});
```
