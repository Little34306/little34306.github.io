const version = 'V1.0.2';

function setHeaderValue(headers, headerName, value) {
  var lowerCaseHeader = headerName.toLowerCase();
  
  if (lowerCaseHeader in headers) {
    headers[lowerCaseHeader] = value;
  } else {
    headers[headerName] = value;
  }
}

var modifiedHeaders = $request.headers;
setHeaderValue(modifiedHeaders, "X-RevenueCat-ETag", "");
$done({headers: modifiedHeaders});
