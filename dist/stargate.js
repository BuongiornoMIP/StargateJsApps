/*!
 * URI.js - Mutating URLs
 *
 * Version: 1.18.10-DD
 *
 * Author: Rodney Rehm
 * Web: http://medialize.github.io/URI.js/
 *
 * Licensed under
 *   MIT License http://www.opensource.org/licenses/mit-license
 *
 */
(function (root, factory) {
  'use strict';
  // https://github.com/umdjs/umd/blob/master/returnExports.js
  if (typeof module === 'object' && module.exports) {
    // Node
    module.exports = factory(require('./punycode'), require('./IPv6'), require('./SecondLevelDomains'));
  } else if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['./punycode', './IPv6', './SecondLevelDomains'], factory);
  } else {
    // Browser globals (root is window)
    root.URI = factory(root.punycode, root.IPv6, root.SecondLevelDomains, root);
  }
}(this, function (punycode, IPv6, SLD, root) {
  'use strict';
  /*global location, escape, unescape */
  // FIXME: v2.0.0 renamce non-camelCase properties to uppercase
  /*jshint camelcase: false */

  // save current URI variable, if any
  var _URI = root && root.URI;

  function URI(url, base) {
    var _urlSupplied = arguments.length >= 1;
    var _baseSupplied = arguments.length >= 2;

    // Allow instantiation without the 'new' keyword
    if (!(this instanceof URI)) {
      if (_urlSupplied) {
        if (_baseSupplied) {
          return new URI(url, base);
        }

        return new URI(url);
      }

      return new URI();
    }

    if (url === undefined) {
      if (_urlSupplied) {
        throw new TypeError('undefined is not a valid argument for URI');
      }

      if (typeof location !== 'undefined') {
        url = location.href + '';
      } else {
        url = '';
      }
    }

    if (url === null) {
      if (_urlSupplied) {
        throw new TypeError('null is not a valid argument for URI');
      }
    }

    this.href(url);

    // resolve to base according to http://dvcs.w3.org/hg/url/raw-file/tip/Overview.html#constructor
    if (base !== undefined) {
      return this.absoluteTo(base);
    }

    return this;
  }

  URI.version = '1.18.10';

  var p = URI.prototype;
  var hasOwn = Object.prototype.hasOwnProperty;

  function escapeRegEx(string) {
    // https://github.com/medialize/URI.js/commit/85ac21783c11f8ccab06106dba9735a31a86924d#commitcomment-821963
    return string.replace(/([.*+?^=!:()|[\]\/\\])/g, '\\$1');
  }

  function getType(value) {
    // IE8 doesn't return [Object Undefined] but [Object Object] for undefined value
    if (value === undefined) {
      return 'Undefined';
    }

    return String(Object.prototype.toString.call(value)).slice(8, -1);
  }

  function isArray(obj) {
    return getType(obj) === 'Array';
  }

  function filterArrayValues(data, value) {
    var lookup = {};
    var i, length;

    if (getType(value) === 'RegExp') {
      lookup = null;
    } else if (isArray(value)) {
      for (i = 0, length = value.length; i < length; i++) {
        lookup[value[i]] = true;
      }
    } else {
      lookup[value] = true;
    }

    for (i = 0, length = data.length; i < length; i++) {
      /*jshint laxbreak: true */
      var _match = lookup && lookup[data[i]] !== undefined
        || !lookup && value.test(data[i]);
      /*jshint laxbreak: false */
      if (_match) {
        data.splice(i, 1);
        length--;
        i--;
      }
    }

    return data;
  }

  function arrayContains(list, value) {
    var i, length;

    // value may be string, number, array, regexp
    if (isArray(value)) {
      // Note: this can be optimized to O(n) (instead of current O(m * n))
      for (i = 0, length = value.length; i < length; i++) {
        if (!arrayContains(list, value[i])) {
          return false;
        }
      }

      return true;
    }

    var _type = getType(value);
    for (i = 0, length = list.length; i < length; i++) {
      if (_type === 'RegExp') {
        if (typeof list[i] === 'string' && list[i].match(value)) {
          return true;
        }
      } else if (list[i] === value) {
        return true;
      }
    }

    return false;
  }

  function arraysEqual(one, two) {
    if (!isArray(one) || !isArray(two)) {
      return false;
    }

    // arrays can't be equal if they have different amount of content
    if (one.length !== two.length) {
      return false;
    }

    one.sort();
    two.sort();

    for (var i = 0, l = one.length; i < l; i++) {
      if (one[i] !== two[i]) {
        return false;
      }
    }

    return true;
  }

  function trimSlashes(text) {
    var trim_expression = /^\/+|\/+$/g;
    return text.replace(trim_expression, '');
  }

  URI._parts = function() {
    return {
      protocol: null,
      username: null,
      password: null,
      hostname: null,
      urn: null,
      port: null,
      path: null,
      query: null,
      fragment: null,
      // state
      duplicateQueryParameters: URI.duplicateQueryParameters,
      escapeQuerySpace: URI.escapeQuerySpace
    };
  };
  // state: allow duplicate query parameters (a=1&a=1)
  URI.duplicateQueryParameters = false;
  // state: replaces + with %20 (space in query strings)
  URI.escapeQuerySpace = true;
  // static properties
  URI.protocol_expression = /^[a-z][a-z0-9.+-]*$/i;
  URI.idn_expression = /[^a-z0-9\.-]/i;
  URI.punycode_expression = /(xn--)/i;
  // well, 333.444.555.666 matches, but it sure ain't no IPv4 - do we care?
  URI.ip4_expression = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
  // credits to Rich Brown
  // source: http://forums.intermapper.com/viewtopic.php?p=1096#1096
  // specification: http://www.ietf.org/rfc/rfc4291.txt
  URI.ip6_expression = /^\s*((([0-9A-Fa-f]{1,4}:){7}([0-9A-Fa-f]{1,4}|:))|(([0-9A-Fa-f]{1,4}:){6}(:[0-9A-Fa-f]{1,4}|((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9A-Fa-f]{1,4}:){5}(((:[0-9A-Fa-f]{1,4}){1,2})|:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9A-Fa-f]{1,4}:){4}(((:[0-9A-Fa-f]{1,4}){1,3})|((:[0-9A-Fa-f]{1,4})?:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){3}(((:[0-9A-Fa-f]{1,4}){1,4})|((:[0-9A-Fa-f]{1,4}){0,2}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){2}(((:[0-9A-Fa-f]{1,4}){1,5})|((:[0-9A-Fa-f]{1,4}){0,3}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){1}(((:[0-9A-Fa-f]{1,4}){1,6})|((:[0-9A-Fa-f]{1,4}){0,4}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(:(((:[0-9A-Fa-f]{1,4}){1,7})|((:[0-9A-Fa-f]{1,4}){0,5}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))(%.+)?\s*$/;
  // expression used is "gruber revised" (@gruber v2) determined to be the
  // best solution in a regex-golf we did a couple of ages ago at
  // * http://mathiasbynens.be/demo/url-regex
  // * http://rodneyrehm.de/t/url-regex.html
  URI.find_uri_expression = /\b((?:[a-z][\w-]+:(?:\/{1,3}|[a-z0-9%])|www\d{0,3}[.]|[a-z0-9.\-]+[.][a-z]{2,4}\/)(?:[^\s()<>]+|\(([^\s()<>]+|(\([^\s()<>]+\)))*\))+(?:\(([^\s()<>]+|(\([^\s()<>]+\)))*\)|[^\s`!()\[\]{};:'".,<>?«»“”‘’]))/ig;
  URI.findUri = {
    // valid "scheme://" or "www."
    start: /\b(?:([a-z][a-z0-9.+-]*:\/\/)|www\.)/gi,
    // everything up to the next whitespace
    end: /[\s\r\n]|$/,
    // trim trailing punctuation captured by end RegExp
    trim: /[`!()\[\]{};:'".,<>?«»“”„‘’]+$/,
    // balanced parens inclusion (), [], {}, <>
    parens: /(\([^\)]*\)|\[[^\]]*\]|\{[^}]*\}|<[^>]*>)/g,
  };
  // http://www.iana.org/assignments/uri-schemes.html
  // http://en.wikipedia.org/wiki/List_of_TCP_and_UDP_port_numbers#Well-known_ports
  URI.defaultPorts = {
    http: '80',
    https: '443',
    ftp: '21',
    gopher: '70',
    ws: '80',
    wss: '443'
  };
  // allowed hostname characters according to RFC 3986
  // ALPHA DIGIT "-" "." "_" "~" "!" "$" "&" "'" "(" ")" "*" "+" "," ";" "=" %encoded
  // I've never seen a (non-IDN) hostname other than: ALPHA DIGIT . -
  URI.invalid_hostname_characters = /[^a-zA-Z0-9\.-]/;
  // map DOM Elements to their URI attribute
  URI.domAttributes = {
    'a': 'href',
    'blockquote': 'cite',
    'link': 'href',
    'base': 'href',
    'script': 'src',
    'form': 'action',
    'img': 'src',
    'area': 'href',
    'iframe': 'src',
    'embed': 'src',
    'source': 'src',
    'track': 'src',
    'input': 'src', // but only if type="image"
    'audio': 'src',
    'video': 'src'
  };
  URI.getDomAttribute = function(node) {
    if (!node || !node.nodeName) {
      return undefined;
    }

    var nodeName = node.nodeName.toLowerCase();
    // <input> should only expose src for type="image"
    if (nodeName === 'input' && node.type !== 'image') {
      return undefined;
    }

    return URI.domAttributes[nodeName];
  };

  function escapeForDumbFirefox36(value) {
    // https://github.com/medialize/URI.js/issues/91
    return escape(value);
  }

  // encoding / decoding according to RFC3986
  function strictEncodeURIComponent(string) {
    // see https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/encodeURIComponent
    return encodeURIComponent(string)
      .replace(/[!'()*]/g, escapeForDumbFirefox36)
      .replace(/\*/g, '%2A');
  }
  URI.encode = strictEncodeURIComponent;
  URI.decode = decodeURIComponent;
  URI.iso8859 = function() {
    URI.encode = escape;
    URI.decode = decodeURI;
  };
  URI.unicode = function() {
    URI.encode = strictEncodeURIComponent;
    URI.decode = decodeURIComponent;
  };
  URI.characters = {
    pathname: {
      encode: {
        // RFC3986 2.1: For consistency, URI producers and normalizers should
        // use uppercase hexadecimal digits for all percent-encodings.
        expression: /%(24|26|2B|2C|3B|3D|3A|40)/ig,
        map: {
          // -._~!'()*
          '%24': '$',
          '%26': '&',
          '%2B': '+',
          '%2C': ',',
          '%3B': ';',
          '%3D': '=',
          '%3A': ':',
          '%40': '@'
        }
      },
      decode: {
        expression: /[\/\?#]/g,
        map: {
          '/': '%2F',
          '?': '%3F',
          '#': '%23'
        }
      }
    },
    reserved: {
      encode: {
        // RFC3986 2.1: For consistency, URI producers and normalizers should
        // use uppercase hexadecimal digits for all percent-encodings.
        expression: /%(21|23|24|26|27|28|29|2A|2B|2C|2F|3A|3B|3D|3F|40|5B|5D)/ig,
        map: {
          // gen-delims
          '%3A': ':',
          '%2F': '/',
          '%3F': '?',
          '%23': '#',
          '%5B': '[',
          '%5D': ']',
          '%40': '@',
          // sub-delims
          '%21': '!',
          '%24': '$',
          '%26': '&',
          '%27': '\'',
          '%28': '(',
          '%29': ')',
          '%2A': '*',
          '%2B': '+',
          '%2C': ',',
          '%3B': ';',
          '%3D': '='
        }
      }
    },
    urnpath: {
      // The characters under `encode` are the characters called out by RFC 2141 as being acceptable
      // for usage in a URN. RFC2141 also calls out "-", ".", and "_" as acceptable characters, but
      // these aren't encoded by encodeURIComponent, so we don't have to call them out here. Also
      // note that the colon character is not featured in the encoding map; this is because URI.js
      // gives the colons in URNs semantic meaning as the delimiters of path segements, and so it
      // should not appear unencoded in a segment itself.
      // See also the note above about RFC3986 and capitalalized hex digits.
      encode: {
        expression: /%(21|24|27|28|29|2A|2B|2C|3B|3D|40)/ig,
        map: {
          '%21': '!',
          '%24': '$',
          '%27': '\'',
          '%28': '(',
          '%29': ')',
          '%2A': '*',
          '%2B': '+',
          '%2C': ',',
          '%3B': ';',
          '%3D': '=',
          '%40': '@'
        }
      },
      // These characters are the characters called out by RFC2141 as "reserved" characters that
      // should never appear in a URN, plus the colon character (see note above).
      decode: {
        expression: /[\/\?#:]/g,
        map: {
          '/': '%2F',
          '?': '%3F',
          '#': '%23',
          ':': '%3A'
        }
      }
    }
  };
  URI.encodeQuery = function(string, escapeQuerySpace) {
    var escaped = URI.encode(string + '');
    if (escapeQuerySpace === undefined) {
      escapeQuerySpace = URI.escapeQuerySpace;
    }

    return escapeQuerySpace ? escaped.replace(/%20/g, '+') : escaped;
  };
  URI.decodeQuery = function(string, escapeQuerySpace) {
    string += '';
    if (escapeQuerySpace === undefined) {
      escapeQuerySpace = URI.escapeQuerySpace;
    }

    try {
      return URI.decode(escapeQuerySpace ? string.replace(/\+/g, '%20') : string);
    } catch(e) {
      // we're not going to mess with weird encodings,
      // give up and return the undecoded original string
      // see https://github.com/medialize/URI.js/issues/87
      // see https://github.com/medialize/URI.js/issues/92
      return string;
    }
  };
  // generate encode/decode path functions
  var _parts = {'encode':'encode', 'decode':'decode'};
  var _part;
  var generateAccessor = function(_group, _part) {
    return function(string) {
      try {
        return URI[_part](string + '').replace(URI.characters[_group][_part].expression, function(c) {
          return URI.characters[_group][_part].map[c];
        });
      } catch (e) {
        // we're not going to mess with weird encodings,
        // give up and return the undecoded original string
        // see https://github.com/medialize/URI.js/issues/87
        // see https://github.com/medialize/URI.js/issues/92
        return string;
      }
    };
  };

  for (_part in _parts) {
    URI[_part + 'PathSegment'] = generateAccessor('pathname', _parts[_part]);
    URI[_part + 'UrnPathSegment'] = generateAccessor('urnpath', _parts[_part]);
  }

  var generateSegmentedPathFunction = function(_sep, _codingFuncName, _innerCodingFuncName) {
    return function(string) {
      // Why pass in names of functions, rather than the function objects themselves? The
      // definitions of some functions (but in particular, URI.decode) will occasionally change due
      // to URI.js having ISO8859 and Unicode modes. Passing in the name and getting it will ensure
      // that the functions we use here are "fresh".
      var actualCodingFunc;
      if (!_innerCodingFuncName) {
        actualCodingFunc = URI[_codingFuncName];
      } else {
        actualCodingFunc = function(string) {
          return URI[_codingFuncName](URI[_innerCodingFuncName](string));
        };
      }

      var segments = (string + '').split(_sep);

      for (var i = 0, length = segments.length; i < length; i++) {
        segments[i] = actualCodingFunc(segments[i]);
      }

      return segments.join(_sep);
    };
  };

  // This takes place outside the above loop because we don't want, e.g., encodeUrnPath functions.
  URI.decodePath = generateSegmentedPathFunction('/', 'decodePathSegment');
  URI.decodeUrnPath = generateSegmentedPathFunction(':', 'decodeUrnPathSegment');
  URI.recodePath = generateSegmentedPathFunction('/', 'encodePathSegment', 'decode');
  URI.recodeUrnPath = generateSegmentedPathFunction(':', 'encodeUrnPathSegment', 'decode');

  URI.encodeReserved = generateAccessor('reserved', 'encode');

  URI.parse = function(string, parts) {
    var pos;
    if (!parts) {
      parts = {};
    }
    // [protocol"://"[username[":"password]"@"]hostname[":"port]"/"?][path]["?"querystring]["#"fragment]

    // extract fragment
    pos = string.indexOf('#');
    if (pos > -1) {
      // escaping?
      parts.fragment = string.substring(pos + 1) || null;
      string = string.substring(0, pos);
    }

    // extract query
    pos = string.indexOf('?');
    if (pos > -1) {
      // escaping?
      parts.query = string.substring(pos + 1) || null;
      string = string.substring(0, pos);
    }

    // extract protocol
    if (string.substring(0, 2) === '//') {
      // relative-scheme
      parts.protocol = null;
      string = string.substring(2);
      // extract "user:pass@host:port"
      string = URI.parseAuthority(string, parts);
    } else {
      pos = string.indexOf(':');
      if (pos > -1) {
        parts.protocol = string.substring(0, pos) || null;
        if (parts.protocol && !parts.protocol.match(URI.protocol_expression)) {
          // : may be within the path
          parts.protocol = undefined;
        } else if (string.substring(pos + 1, pos + 3) === '//') {
          string = string.substring(pos + 3);

          // extract "user:pass@host:port"
          string = URI.parseAuthority(string, parts);
        } else {
          string = string.substring(pos + 1);
          parts.urn = true;
        }
      }
    }

    // what's left must be the path
    parts.path = string;

    // and we're done
    return parts;
  };
  URI.parseHost = function(string, parts) {
    // Copy chrome, IE, opera backslash-handling behavior.
    // Back slashes before the query string get converted to forward slashes
    // See: https://github.com/joyent/node/blob/386fd24f49b0e9d1a8a076592a404168faeecc34/lib/url.js#L115-L124
    // See: https://code.google.com/p/chromium/issues/detail?id=25916
    // https://github.com/medialize/URI.js/pull/233
    string = string.replace(/\\/g, '/');

    // extract host:port
    var pos = string.indexOf('/');
    var bracketPos;
    var t;

    if (pos === -1) {
      pos = string.length;
    }

    if (string.charAt(0) === '[') {
      // IPv6 host - http://tools.ietf.org/html/draft-ietf-6man-text-addr-representation-04#section-6
      // I claim most client software breaks on IPv6 anyways. To simplify things, URI only accepts
      // IPv6+port in the format [2001:db8::1]:80 (for the time being)
      bracketPos = string.indexOf(']');
      parts.hostname = string.substring(1, bracketPos) || null;
      parts.port = string.substring(bracketPos + 2, pos) || null;
      if (parts.port === '/') {
        parts.port = null;
      }
    } else {
      var firstColon = string.indexOf(':');
      var firstSlash = string.indexOf('/');
      var nextColon = string.indexOf(':', firstColon + 1);
      if (nextColon !== -1 && (firstSlash === -1 || nextColon < firstSlash)) {
        // IPv6 host contains multiple colons - but no port
        // this notation is actually not allowed by RFC 3986, but we're a liberal parser
        parts.hostname = string.substring(0, pos) || null;
        parts.port = null;
      } else {
        t = string.substring(0, pos).split(':');
        parts.hostname = t[0] || null;
        parts.port = t[1] || null;
      }
    }

    if (parts.hostname && string.substring(pos).charAt(0) !== '/') {
      pos++;
      string = '/' + string;
    }

    return string.substring(pos) || '/';
  };
  URI.parseAuthority = function(string, parts) {
    string = URI.parseUserinfo(string, parts);
    return URI.parseHost(string, parts);
  };
  URI.parseUserinfo = function(string, parts) {
    // extract username:password
    var firstSlash = string.indexOf('/');
    var pos = string.lastIndexOf('@', firstSlash > -1 ? firstSlash : string.length - 1);
    var t;

    // authority@ must come before /path
    if (pos > -1 && (firstSlash === -1 || pos < firstSlash)) {
      t = string.substring(0, pos).split(':');
      parts.username = t[0] ? URI.decode(t[0]) : null;
      t.shift();
      parts.password = t[0] ? URI.decode(t.join(':')) : null;
      string = string.substring(pos + 1);
    } else {
      parts.username = null;
      parts.password = null;
    }

    return string;
  };
  URI.parseQuery = function(string, escapeQuerySpace) {
    if (!string) {
      return {};
    }

    // throw out the funky business - "?"[name"="value"&"]+
    string = string.replace(/&+/g, '&').replace(/^\?*&*|&+$/g, '');

    if (!string) {
      return {};
    }

    var items = {};
    var splits = string.split('&');
    var length = splits.length;
    var v, name, value;

    for (var i = 0; i < length; i++) {
      v = splits[i].split('=');
      name = URI.decodeQuery(v.shift(), escapeQuerySpace);
      // no "=" is null according to http://dvcs.w3.org/hg/url/raw-file/tip/Overview.html#collect-url-parameters
      value = v.length ? URI.decodeQuery(v.join('='), escapeQuerySpace) : null;

      if (hasOwn.call(items, name)) {
        if (typeof items[name] === 'string' || items[name] === null) {
          items[name] = [items[name]];
        }

        items[name].push(value);
      } else {
        items[name] = value;
      }
    }

    return items;
  };

  URI.build = function(parts) {
    var t = '';

    if (parts.protocol) {
      t += parts.protocol + ':';
    }

    if (!parts.urn && (t || parts.hostname)) {
      t += '//';
    }

    t += (URI.buildAuthority(parts) || '');

    if (typeof parts.path === 'string') {
      if (parts.path.charAt(0) !== '/' && typeof parts.hostname === 'string') {
        t += '/';
      }

      t += parts.path;
    }

    if (typeof parts.query === 'string' && parts.query) {
      t += '?' + parts.query;
    }

    if (typeof parts.fragment === 'string' && parts.fragment) {
      t += '#' + parts.fragment;
    }
    return t;
  };
  URI.buildHost = function(parts) {
    var t = '';

    if (!parts.hostname) {
      return '';
    } else if (URI.ip6_expression.test(parts.hostname)) {
      t += '[' + parts.hostname + ']';
    } else {
      t += parts.hostname;
    }

    if (parts.port) {
      t += ':' + parts.port;
    }

    return t;
  };
  URI.buildAuthority = function(parts) {
    return URI.buildUserinfo(parts) + URI.buildHost(parts);
  };
  URI.buildUserinfo = function(parts) {
    var t = '';

    if (parts.username) {
      t += URI.encode(parts.username);
    }

    if (parts.password) {
      t += ':' + URI.encode(parts.password);
    }

    if (t) {
      t += '@';
    }

    return t;
  };
  URI.buildQuery = function(data, duplicateQueryParameters, escapeQuerySpace) {
    // according to http://tools.ietf.org/html/rfc3986 or http://labs.apache.org/webarch/uri/rfc/rfc3986.html
    // being »-._~!$&'()*+,;=:@/?« %HEX and alnum are allowed
    // the RFC explicitly states ?/foo being a valid use case, no mention of parameter syntax!
    // URI.js treats the query string as being application/x-www-form-urlencoded
    // see http://www.w3.org/TR/REC-html40/interact/forms.html#form-content-type

    var t = '';
    var unique, key, i, length;
    for (key in data) {
      if (hasOwn.call(data, key) && key) {
        if (isArray(data[key])) {
          unique = {};
          for (i = 0, length = data[key].length; i < length; i++) {
            if (data[key][i] !== undefined && unique[data[key][i] + ''] === undefined) {
              t += '&' + URI.buildQueryParameter(key, data[key][i], escapeQuerySpace);
              if (duplicateQueryParameters !== true) {
                unique[data[key][i] + ''] = true;
              }
            }
          }
        } else if (data[key] !== undefined) {
          t += '&' + URI.buildQueryParameter(key, data[key], escapeQuerySpace);
        }
      }
    }

    return t.substring(1);
  };
  URI.buildQueryParameter = function(name, value, escapeQuerySpace) {
    // http://www.w3.org/TR/REC-html40/interact/forms.html#form-content-type -- application/x-www-form-urlencoded
    // don't append "=" for null values, according to http://dvcs.w3.org/hg/url/raw-file/tip/Overview.html#url-parameter-serialization
    return URI.encodeQuery(name, escapeQuerySpace) + (value !== null ? '=' + URI.encodeQuery(value, escapeQuerySpace) : '');
  };

  URI.addQuery = function(data, name, value) {
    if (typeof name === 'object') {
      for (var key in name) {
        if (hasOwn.call(name, key)) {
          URI.addQuery(data, key, name[key]);
        }
      }
    } else if (typeof name === 'string') {
      if (data[name] === undefined) {
        data[name] = value;
        return;
      } else if (typeof data[name] === 'string') {
        data[name] = [data[name]];
      }

      if (!isArray(value)) {
        value = [value];
      }

      data[name] = (data[name] || []).concat(value);
    } else {
      throw new TypeError('URI.addQuery() accepts an object, string as the name parameter');
    }
  };
  URI.removeQuery = function(data, name, value) {
    var i, length, key;

    if (isArray(name)) {
      for (i = 0, length = name.length; i < length; i++) {
        data[name[i]] = undefined;
      }
    } else if (getType(name) === 'RegExp') {
      for (key in data) {
        if (name.test(key)) {
          data[key] = undefined;
        }
      }
    } else if (typeof name === 'object') {
      for (key in name) {
        if (hasOwn.call(name, key)) {
          URI.removeQuery(data, key, name[key]);
        }
      }
    } else if (typeof name === 'string') {
      if (value !== undefined) {
        if (getType(value) === 'RegExp') {
          if (!isArray(data[name]) && value.test(data[name])) {
            data[name] = undefined;
          } else {
            data[name] = filterArrayValues(data[name], value);
          }
        } else if (data[name] === String(value) && (!isArray(value) || value.length === 1)) {
          data[name] = undefined;
        } else if (isArray(data[name])) {
          data[name] = filterArrayValues(data[name], value);
        }
      } else {
        data[name] = undefined;
      }
    } else {
      throw new TypeError('URI.removeQuery() accepts an object, string, RegExp as the first parameter');
    }
  };
  URI.hasQuery = function(data, name, value, withinArray) {
    switch (getType(name)) {
      case 'String':
        // Nothing to do here
        break;

      case 'RegExp':
        for (var key in data) {
          if (hasOwn.call(data, key)) {
            if (name.test(key) && (value === undefined || URI.hasQuery(data, key, value))) {
              return true;
            }
          }
        }

        return false;

      case 'Object':
        for (var _key in name) {
          if (hasOwn.call(name, _key)) {
            if (!URI.hasQuery(data, _key, name[_key])) {
              return false;
            }
          }
        }

        return true;

      default:
        throw new TypeError('URI.hasQuery() accepts a string, regular expression or object as the name parameter');
    }

    switch (getType(value)) {
      case 'Undefined':
        // true if exists (but may be empty)
        return name in data; // data[name] !== undefined;

      case 'Boolean':
        // true if exists and non-empty
        var _booly = Boolean(isArray(data[name]) ? data[name].length : data[name]);
        return value === _booly;

      case 'Function':
        // allow complex comparison
        return !!value(data[name], name, data);

      case 'Array':
        if (!isArray(data[name])) {
          return false;
        }

        var op = withinArray ? arrayContains : arraysEqual;
        return op(data[name], value);

      case 'RegExp':
        if (!isArray(data[name])) {
          return Boolean(data[name] && data[name].match(value));
        }

        if (!withinArray) {
          return false;
        }

        return arrayContains(data[name], value);

      case 'Number':
        value = String(value);
        /* falls through */
      case 'String':
        if (!isArray(data[name])) {
          return data[name] === value;
        }

        if (!withinArray) {
          return false;
        }

        return arrayContains(data[name], value);

      default:
        throw new TypeError('URI.hasQuery() accepts undefined, boolean, string, number, RegExp, Function as the value parameter');
    }
  };


  URI.joinPaths = function() {
    var input = [];
    var segments = [];
    var nonEmptySegments = 0;

    for (var i = 0; i < arguments.length; i++) {
      var url = new URI(arguments[i]);
      input.push(url);
      var _segments = url.segment();
      for (var s = 0; s < _segments.length; s++) {
        if (typeof _segments[s] === 'string') {
          segments.push(_segments[s]);
        }

        if (_segments[s]) {
          nonEmptySegments++;
        }
      }
    }

    if (!segments.length || !nonEmptySegments) {
      return new URI('');
    }

    var uri = new URI('').segment(segments);

    if (input[0].path() === '' || input[0].path().slice(0, 1) === '/') {
      uri.path('/' + uri.path());
    }

    return uri.normalize();
  };

  URI.commonPath = function(one, two) {
    var length = Math.min(one.length, two.length);
    var pos;

    // find first non-matching character
    for (pos = 0; pos < length; pos++) {
      if (one.charAt(pos) !== two.charAt(pos)) {
        pos--;
        break;
      }
    }

    if (pos < 1) {
      return one.charAt(0) === two.charAt(0) && one.charAt(0) === '/' ? '/' : '';
    }

    // revert to last /
    if (one.charAt(pos) !== '/' || two.charAt(pos) !== '/') {
      pos = one.substring(0, pos).lastIndexOf('/');
    }

    return one.substring(0, pos + 1);
  };

  URI.withinString = function(string, callback, options) {
    options || (options = {});
    var _start = options.start || URI.findUri.start;
    var _end = options.end || URI.findUri.end;
    var _trim = options.trim || URI.findUri.trim;
    var _parens = options.parens || URI.findUri.parens;
    var _attributeOpen = /[a-z0-9-]=["']?$/i;

    _start.lastIndex = 0;
    while (true) {
      var match = _start.exec(string);
      if (!match) {
        break;
      }

      var start = match.index;
      if (options.ignoreHtml) {
        // attribut(e=["']?$)
        var attributeOpen = string.slice(Math.max(start - 3, 0), start);
        if (attributeOpen && _attributeOpen.test(attributeOpen)) {
          continue;
        }
      }

      var end = start + string.slice(start).search(_end);
      var slice = string.slice(start, end);
      // make sure we include well balanced parens
      var parensEnd = -1;
      while (true) {
        var parensMatch = _parens.exec(slice);
        if (!parensMatch) {
          break;
        }

        var parensMatchEnd = parensMatch.index + parensMatch[0].length;
        parensEnd = Math.max(parensEnd, parensMatchEnd);
      }

      if (parensEnd > -1) {
        slice = slice.slice(0, parensEnd) + slice.slice(parensEnd).replace(_trim, '');
      } else {
        slice = slice.replace(_trim, '');
      }

      if (slice.length <= match[0].length) {
        // the extract only contains the starting marker of a URI,
        // e.g. "www" or "http://"
        continue;
      }

      if (options.ignore && options.ignore.test(slice)) {
        continue;
      }

      end = start + slice.length;
      var result = callback(slice, start, end, string);
      if (result === undefined) {
        _start.lastIndex = end;
        continue;
      }

      result = String(result);
      string = string.slice(0, start) + result + string.slice(end);
      _start.lastIndex = start + result.length;
    }

    _start.lastIndex = 0;
    return string;
  };

  URI.ensureValidHostname = function(v) {
    // Theoretically URIs allow percent-encoding in Hostnames (according to RFC 3986)
    // they are not part of DNS and therefore ignored by URI.js

    if (v.match(URI.invalid_hostname_characters)) {
      // test punycode
      if (!punycode) {
        throw new TypeError('Hostname "' + v + '" contains characters other than [A-Z0-9.-] and Punycode.js is not available');
      }

      if (punycode.toASCII(v).match(URI.invalid_hostname_characters)) {
        throw new TypeError('Hostname "' + v + '" contains characters other than [A-Z0-9.-]');
      }
    }
  };

  // noConflict
  URI.noConflict = function(removeAll) {
    if (removeAll) {
      var unconflicted = {
        URI: this.noConflict()
      };

      if (root.URITemplate && typeof root.URITemplate.noConflict === 'function') {
        unconflicted.URITemplate = root.URITemplate.noConflict();
      }

      if (root.IPv6 && typeof root.IPv6.noConflict === 'function') {
        unconflicted.IPv6 = root.IPv6.noConflict();
      }

      if (root.SecondLevelDomains && typeof root.SecondLevelDomains.noConflict === 'function') {
        unconflicted.SecondLevelDomains = root.SecondLevelDomains.noConflict();
      }

      return unconflicted;
    } else if (root.URI === this) {
      root.URI = _URI;
    }

    return this;
  };

  p.build = function(deferBuild) {
    if (deferBuild === true) {
      this._deferred_build = true;
    } else if (deferBuild === undefined || this._deferred_build) {
      this._string = URI.build(this._parts);
      this._deferred_build = false;
    }

    return this;
  };

  p.clone = function() {
    return new URI(this);
  };

  p.valueOf = p.toString = function() {
    return this.build(false)._string;
  };


  function generateSimpleAccessor(_part){
    return function(v, build) {
      if (v === undefined) {
        return this._parts[_part] || '';
      } else {
        this._parts[_part] = v || null;
        this.build(!build);
        return this;
      }
    };
  }

  function generatePrefixAccessor(_part, _key){
    return function(v, build) {
      if (v === undefined) {
        return this._parts[_part] || '';
      } else {
        if (v !== null) {
          v = v + '';
          if (v.charAt(0) === _key) {
            v = v.substring(1);
          }
        }

        this._parts[_part] = v;
        this.build(!build);
        return this;
      }
    };
  }

  p.protocol = generateSimpleAccessor('protocol');
  p.username = generateSimpleAccessor('username');
  p.password = generateSimpleAccessor('password');
  p.hostname = generateSimpleAccessor('hostname');
  p.port = generateSimpleAccessor('port');
  p.query = generatePrefixAccessor('query', '?');
  p.fragment = generatePrefixAccessor('fragment', '#');

  p.search = function(v, build) {
    var t = this.query(v, build);
    return typeof t === 'string' && t.length ? ('?' + t) : t;
  };
  p.hash = function(v, build) {
    var t = this.fragment(v, build);
    return typeof t === 'string' && t.length ? ('#' + t) : t;
  };

  p.pathname = function(v, build) {
    if (v === undefined || v === true) {
      var res = this._parts.path || (this._parts.hostname ? '/' : '');
      return v ? (this._parts.urn ? URI.decodeUrnPath : URI.decodePath)(res) : res;
    } else {
      if (this._parts.urn) {
        this._parts.path = v ? URI.recodeUrnPath(v) : '';
      } else {
        this._parts.path = v ? URI.recodePath(v) : '/';
      }
      this.build(!build);
      return this;
    }
  };
  p.path = p.pathname;
  p.href = function(href, build) {
    var key;

    if (href === undefined) {
      return this.toString();
    }

    this._string = '';
    this._parts = URI._parts();

    var _URI = href instanceof URI;
    var _object = typeof href === 'object' && (href.hostname || href.path || href.pathname);
    if (href.nodeName) {
      var attribute = URI.getDomAttribute(href);
      href = href[attribute] || '';
      _object = false;
    }

    // window.location is reported to be an object, but it's not the sort
    // of object we're looking for:
    // * location.protocol ends with a colon
    // * location.query != object.search
    // * location.hash != object.fragment
    // simply serializing the unknown object should do the trick
    // (for location, not for everything...)
    if (!_URI && _object && href.pathname !== undefined) {
      href = href.toString();
    }

    if (typeof href === 'string' || href instanceof String) {
      this._parts = URI.parse(String(href), this._parts);
    } else if (_URI || _object) {
      var src = _URI ? href._parts : href;
      for (key in src) {
        if (hasOwn.call(this._parts, key)) {
          this._parts[key] = src[key];
        }
      }
    } else {
      throw new TypeError('invalid input');
    }

    this.build(!build);
    return this;
  };

  // identification accessors
  p.is = function(what) {
    var ip = false;
    var ip4 = false;
    var ip6 = false;
    var name = false;
    var sld = false;
    var idn = false;
    var punycode = false;
    var relative = !this._parts.urn;

    if (this._parts.hostname) {
      relative = false;
      ip4 = URI.ip4_expression.test(this._parts.hostname);
      ip6 = URI.ip6_expression.test(this._parts.hostname);
      ip = ip4 || ip6;
      name = !ip;
      sld = name && SLD && SLD.has(this._parts.hostname);
      idn = name && URI.idn_expression.test(this._parts.hostname);
      punycode = name && URI.punycode_expression.test(this._parts.hostname);
    }

    switch (what.toLowerCase()) {
      case 'relative':
        return relative;

      case 'absolute':
        return !relative;

      // hostname identification
      case 'domain':
      case 'name':
        return name;

      case 'sld':
        return sld;

      case 'ip':
        return ip;

      case 'ip4':
      case 'ipv4':
      case 'inet4':
        return ip4;

      case 'ip6':
      case 'ipv6':
      case 'inet6':
        return ip6;

      case 'idn':
        return idn;

      case 'url':
        return !this._parts.urn;

      case 'urn':
        return !!this._parts.urn;

      case 'punycode':
        return punycode;
    }

    return null;
  };

  // component specific input validation
  var _protocol = p.protocol;
  var _port = p.port;
  var _hostname = p.hostname;

  p.protocol = function(v, build) {
    if (v !== undefined) {
      if (v) {
        // accept trailing ://
        v = v.replace(/:(\/\/)?$/, '');

        if (!v.match(URI.protocol_expression)) {
          throw new TypeError('Protocol "' + v + '" contains characters other than [A-Z0-9.+-] or doesn\'t start with [A-Z]');
        }
      }
    }
    return _protocol.call(this, v, build);
  };
  p.scheme = p.protocol;
  p.port = function(v, build) {
    if (this._parts.urn) {
      return v === undefined ? '' : this;
    }

    if (v !== undefined) {
      if (v === 0) {
        v = null;
      }

      if (v) {
        v += '';
        if (v.charAt(0) === ':') {
          v = v.substring(1);
        }

        if (v.match(/[^0-9]/)) {
          throw new TypeError('Port "' + v + '" contains characters other than [0-9]');
        }
      }
    }
    return _port.call(this, v, build);
  };
  p.hostname = function(v, build) {
    if (this._parts.urn) {
      return v === undefined ? '' : this;
    }

    if (v !== undefined) {
      var x = {};
      var res = URI.parseHost(v, x);
      if (res !== '/') {
        throw new TypeError('Hostname "' + v + '" contains characters other than [A-Z0-9.-]');
      }

      v = x.hostname;
    }
    return _hostname.call(this, v, build);
  };

  // compound accessors
  p.origin = function(v, build) {
    if (this._parts.urn) {
      return v === undefined ? '' : this;
    }

    if (v === undefined) {
      var protocol = this.protocol();
      var authority = this.authority();
      if (!authority) {
        return '';
      }

      return (protocol ? protocol + '://' : '') + this.authority();
    } else {
      var origin = URI(v);
      this
        .protocol(origin.protocol())
        .authority(origin.authority())
        .build(!build);
      return this;
    }
  };
  p.host = function(v, build) {
    if (this._parts.urn) {
      return v === undefined ? '' : this;
    }

    if (v === undefined) {
      return this._parts.hostname ? URI.buildHost(this._parts) : '';
    } else {
      var res = URI.parseHost(v, this._parts);
      if (res !== '/') {
        throw new TypeError('Hostname "' + v + '" contains characters other than [A-Z0-9.-]');
      }

      this.build(!build);
      return this;
    }
  };
  p.authority = function(v, build) {
    if (this._parts.urn) {
      return v === undefined ? '' : this;
    }

    if (v === undefined) {
      return this._parts.hostname ? URI.buildAuthority(this._parts) : '';
    } else {
      var res = URI.parseAuthority(v, this._parts);
      if (res !== '/') {
        throw new TypeError('Hostname "' + v + '" contains characters other than [A-Z0-9.-]');
      }

      this.build(!build);
      return this;
    }
  };
  p.userinfo = function(v, build) {
    if (this._parts.urn) {
      return v === undefined ? '' : this;
    }

    if (v === undefined) {
      var t = URI.buildUserinfo(this._parts);
      return t ? t.substring(0, t.length -1) : t;
    } else {
      if (v[v.length-1] !== '@') {
        v += '@';
      }

      URI.parseUserinfo(v, this._parts);
      this.build(!build);
      return this;
    }
  };
  p.resource = function(v, build) {
    var parts;

    if (v === undefined) {
      return this.path() + this.search() + this.hash();
    }

    parts = URI.parse(v);
    this._parts.path = parts.path;
    this._parts.query = parts.query;
    this._parts.fragment = parts.fragment;
    this.build(!build);
    return this;
  };

  // fraction accessors
  p.subdomain = function(v, build) {
    if (this._parts.urn) {
      return v === undefined ? '' : this;
    }

    // convenience, return "www" from "www.example.org"
    if (v === undefined) {
      if (!this._parts.hostname || this.is('IP')) {
        return '';
      }

      // grab domain and add another segment
      var end = this._parts.hostname.length - this.domain().length - 1;
      return this._parts.hostname.substring(0, end) || '';
    } else {
      var e = this._parts.hostname.length - this.domain().length;
      var sub = this._parts.hostname.substring(0, e);
      var replace = new RegExp('^' + escapeRegEx(sub));

      if (v && v.charAt(v.length - 1) !== '.') {
        v += '.';
      }

      if (v) {
        URI.ensureValidHostname(v);
      }

      this._parts.hostname = this._parts.hostname.replace(replace, v);
      this.build(!build);
      return this;
    }
  };
  p.domain = function(v, build) {
    if (this._parts.urn) {
      return v === undefined ? '' : this;
    }

    if (typeof v === 'boolean') {
      build = v;
      v = undefined;
    }

    // convenience, return "example.org" from "www.example.org"
    if (v === undefined) {
      if (!this._parts.hostname || this.is('IP')) {
        return '';
      }

      // if hostname consists of 1 or 2 segments, it must be the domain
      var t = this._parts.hostname.match(/\./g);
      if (t && t.length < 2) {
        return this._parts.hostname;
      }

      // grab tld and add another segment
      var end = this._parts.hostname.length - this.tld(build).length - 1;
      end = this._parts.hostname.lastIndexOf('.', end -1) + 1;
      return this._parts.hostname.substring(end) || '';
    } else {
      if (!v) {
        throw new TypeError('cannot set domain empty');
      }

      URI.ensureValidHostname(v);

      if (!this._parts.hostname || this.is('IP')) {
        this._parts.hostname = v;
      } else {
        var replace = new RegExp(escapeRegEx(this.domain()) + '$');
        this._parts.hostname = this._parts.hostname.replace(replace, v);
      }

      this.build(!build);
      return this;
    }
  };
  p.tld = function(v, build) {
    if (this._parts.urn) {
      return v === undefined ? '' : this;
    }

    if (typeof v === 'boolean') {
      build = v;
      v = undefined;
    }

    // return "org" from "www.example.org"
    if (v === undefined) {
      if (!this._parts.hostname || this.is('IP')) {
        return '';
      }

      var pos = this._parts.hostname.lastIndexOf('.');
      var tld = this._parts.hostname.substring(pos + 1);

      if (build !== true && SLD && SLD.list[tld.toLowerCase()]) {
        return SLD.get(this._parts.hostname) || tld;
      }

      return tld;
    } else {
      var replace;

      if (!v) {
        throw new TypeError('cannot set TLD empty');
      } else if (v.match(/[^a-zA-Z0-9-]/)) {
        if (SLD && SLD.is(v)) {
          replace = new RegExp(escapeRegEx(this.tld()) + '$');
          this._parts.hostname = this._parts.hostname.replace(replace, v);
        } else {
          throw new TypeError('TLD "' + v + '" contains characters other than [A-Z0-9]');
        }
      } else if (!this._parts.hostname || this.is('IP')) {
        throw new ReferenceError('cannot set TLD on non-domain host');
      } else {
        replace = new RegExp(escapeRegEx(this.tld()) + '$');
        this._parts.hostname = this._parts.hostname.replace(replace, v);
      }

      this.build(!build);
      return this;
    }
  };
  p.directory = function(v, build) {
    if (this._parts.urn) {
      return v === undefined ? '' : this;
    }

    if (v === undefined || v === true) {
      if (!this._parts.path && !this._parts.hostname) {
        return '';
      }

      if (this._parts.path === '/') {
        return '/';
      }

      var end = this._parts.path.length - this.filename().length - 1;
      var res = this._parts.path.substring(0, end) || (this._parts.hostname ? '/' : '');

      return v ? URI.decodePath(res) : res;

    } else {
      var e = this._parts.path.length - this.filename().length;
      var directory = this._parts.path.substring(0, e);
      var replace = new RegExp('^' + escapeRegEx(directory));

      // fully qualifier directories begin with a slash
      if (!this.is('relative')) {
        if (!v) {
          v = '/';
        }

        if (v.charAt(0) !== '/') {
          v = '/' + v;
        }
      }

      // directories always end with a slash
      if (v && v.charAt(v.length - 1) !== '/') {
        v += '/';
      }

      v = URI.recodePath(v);
      this._parts.path = this._parts.path.replace(replace, v);
      this.build(!build);
      return this;
    }
  };
  p.filename = function(v, build) {
    if (this._parts.urn) {
      return v === undefined ? '' : this;
    }

    if (typeof v !== 'string') {
      if (!this._parts.path || this._parts.path === '/') {
        return '';
      }

      var pos = this._parts.path.lastIndexOf('/');
      var res = this._parts.path.substring(pos+1);

      return v ? URI.decodePathSegment(res) : res;
    } else {
      var mutatedDirectory = false;

      if (v.charAt(0) === '/') {
        v = v.substring(1);
      }

      if (v.match(/\.?\//)) {
        mutatedDirectory = true;
      }

      var replace = new RegExp(escapeRegEx(this.filename()) + '$');
      v = URI.recodePath(v);
      this._parts.path = this._parts.path.replace(replace, v);

      if (mutatedDirectory) {
        this.normalizePath(build);
      } else {
        this.build(!build);
      }

      return this;
    }
  };
  p.suffix = function(v, build) {
    if (this._parts.urn) {
      return v === undefined ? '' : this;
    }

    if (v === undefined || v === true) {
      if (!this._parts.path || this._parts.path === '/') {
        return '';
      }

      var filename = this.filename();
      var pos = filename.lastIndexOf('.');
      var s, res;

      if (pos === -1) {
        return '';
      }

      // suffix may only contain alnum characters (yup, I made this up.)
      s = filename.substring(pos+1);
      res = (/^[a-z0-9%]+$/i).test(s) ? s : '';
      return v ? URI.decodePathSegment(res) : res;
    } else {
      if (v.charAt(0) === '.') {
        v = v.substring(1);
      }

      var suffix = this.suffix();
      var replace;

      if (!suffix) {
        if (!v) {
          return this;
        }

        this._parts.path += '.' + URI.recodePath(v);
      } else if (!v) {
        replace = new RegExp(escapeRegEx('.' + suffix) + '$');
      } else {
        replace = new RegExp(escapeRegEx(suffix) + '$');
      }

      if (replace) {
        v = URI.recodePath(v);
        this._parts.path = this._parts.path.replace(replace, v);
      }

      this.build(!build);
      return this;
    }
  };
  p.segment = function(segment, v, build) {
    var separator = this._parts.urn ? ':' : '/';
    var path = this.path();
    var absolute = path.substring(0, 1) === '/';
    var segments = path.split(separator);

    if (segment !== undefined && typeof segment !== 'number') {
      build = v;
      v = segment;
      segment = undefined;
    }

    if (segment !== undefined && typeof segment !== 'number') {
      throw new Error('Bad segment "' + segment + '", must be 0-based integer');
    }

    if (absolute) {
      segments.shift();
    }

    if (segment < 0) {
      // allow negative indexes to address from the end
      segment = Math.max(segments.length + segment, 0);
    }

    if (v === undefined) {
      /*jshint laxbreak: true */
      return segment === undefined
        ? segments
        : segments[segment];
      /*jshint laxbreak: false */
    } else if (segment === null || segments[segment] === undefined) {
      if (isArray(v)) {
        segments = [];
        // collapse empty elements within array
        for (var i=0, l=v.length; i < l; i++) {
          if (!v[i].length && (!segments.length || !segments[segments.length -1].length)) {
            continue;
          }

          if (segments.length && !segments[segments.length -1].length) {
            segments.pop();
          }

          segments.push(trimSlashes(v[i]));
        }
      } else if (v || typeof v === 'string') {
        v = trimSlashes(v);
        if (segments[segments.length -1] === '') {
          // empty trailing elements have to be overwritten
          // to prevent results such as /foo//bar
          segments[segments.length -1] = v;
        } else {
          segments.push(v);
        }
      }
    } else {
      if (v) {
        segments[segment] = trimSlashes(v);
      } else {
        segments.splice(segment, 1);
      }
    }

    if (absolute) {
      segments.unshift('');
    }

    return this.path(segments.join(separator), build);
  };
  p.segmentCoded = function(segment, v, build) {
    var segments, i, l;

    if (typeof segment !== 'number') {
      build = v;
      v = segment;
      segment = undefined;
    }

    if (v === undefined) {
      segments = this.segment(segment, v, build);
      if (!isArray(segments)) {
        segments = segments !== undefined ? URI.decode(segments) : undefined;
      } else {
        for (i = 0, l = segments.length; i < l; i++) {
          segments[i] = URI.decode(segments[i]);
        }
      }

      return segments;
    }

    if (!isArray(v)) {
      v = (typeof v === 'string' || v instanceof String) ? URI.encode(v) : v;
    } else {
      for (i = 0, l = v.length; i < l; i++) {
        v[i] = URI.encode(v[i]);
      }
    }

    return this.segment(segment, v, build);
  };

  // mutating query string
  var q = p.query;
  p.query = function(v, build) {
    if (v === true) {
      return URI.parseQuery(this._parts.query, this._parts.escapeQuerySpace);
    } else if (typeof v === 'function') {
      var data = URI.parseQuery(this._parts.query, this._parts.escapeQuerySpace);
      var result = v.call(this, data);
      this._parts.query = URI.buildQuery(result || data, this._parts.duplicateQueryParameters, this._parts.escapeQuerySpace);
      this.build(!build);
      return this;
    } else if (v !== undefined && typeof v !== 'string') {
      this._parts.query = URI.buildQuery(v, this._parts.duplicateQueryParameters, this._parts.escapeQuerySpace);
      this.build(!build);
      return this;
    } else {
      return q.call(this, v, build);
    }
  };
  p.setQuery = function(name, value, build) {
    var data = URI.parseQuery(this._parts.query, this._parts.escapeQuerySpace);

    if (typeof name === 'string' || name instanceof String) {
      data[name] = value !== undefined ? value : null;
    } else if (typeof name === 'object') {
      for (var key in name) {
        if (hasOwn.call(name, key)) {
          data[key] = name[key];
        }
      }
    } else {
      throw new TypeError('URI.addQuery() accepts an object, string as the name parameter');
    }

    this._parts.query = URI.buildQuery(data, this._parts.duplicateQueryParameters, this._parts.escapeQuerySpace);
    if (typeof name !== 'string') {
      build = value;
    }

    this.build(!build);
    return this;
  };
  p.addQuery = function(name, value, build) {
    var data = URI.parseQuery(this._parts.query, this._parts.escapeQuerySpace);
    URI.addQuery(data, name, value === undefined ? null : value);
    this._parts.query = URI.buildQuery(data, this._parts.duplicateQueryParameters, this._parts.escapeQuerySpace);
    if (typeof name !== 'string') {
      build = value;
    }

    this.build(!build);
    return this;
  };
  p.removeQuery = function(name, value, build) {
    var data = URI.parseQuery(this._parts.query, this._parts.escapeQuerySpace);
    URI.removeQuery(data, name, value);
    this._parts.query = URI.buildQuery(data, this._parts.duplicateQueryParameters, this._parts.escapeQuerySpace);
    if (typeof name !== 'string') {
      build = value;
    }

    this.build(!build);
    return this;
  };
  p.hasQuery = function(name, value, withinArray) {
    var data = URI.parseQuery(this._parts.query, this._parts.escapeQuerySpace);
    return URI.hasQuery(data, name, value, withinArray);
  };
  p.setSearch = p.setQuery;
  p.addSearch = p.addQuery;
  p.removeSearch = p.removeQuery;
  p.hasSearch = p.hasQuery;

  // sanitizing URLs
  p.normalize = function() {
    if (this._parts.urn) {
      return this
        .normalizeProtocol(false)
        .normalizePath(false)
        .normalizeQuery(false)
        .normalizeFragment(false)
        .build();
    }

    return this
      .normalizeProtocol(false)
      .normalizeHostname(false)
      .normalizePort(false)
      .normalizePath(false)
      .normalizeQuery(false)
      .normalizeFragment(false)
      .build();
  };
  p.normalizeProtocol = function(build) {
    if (typeof this._parts.protocol === 'string') {
      this._parts.protocol = this._parts.protocol.toLowerCase();
      this.build(!build);
    }

    return this;
  };
  p.normalizeHostname = function(build) {
    if (this._parts.hostname) {
      if (this.is('IDN') && punycode) {
        this._parts.hostname = punycode.toASCII(this._parts.hostname);
      } else if (this.is('IPv6') && IPv6) {
        this._parts.hostname = IPv6.best(this._parts.hostname);
      }

      this._parts.hostname = this._parts.hostname.toLowerCase();
      this.build(!build);
    }

    return this;
  };
  p.normalizePort = function(build) {
    // remove port of it's the protocol's default
    if (typeof this._parts.protocol === 'string' && this._parts.port === URI.defaultPorts[this._parts.protocol]) {
      this._parts.port = null;
      this.build(!build);
    }

    return this;
  };
  p.normalizePath = function(build) {
    var _path = this._parts.path;
    if (!_path) {
      return this;
    }

    if (this._parts.urn) {
      this._parts.path = URI.recodeUrnPath(this._parts.path);
      this.build(!build);
      return this;
    }

    if (this._parts.path === '/') {
      return this;
    }

    _path = URI.recodePath(_path);

    var _was_relative;
    var _leadingParents = '';
    var _parent, _pos;

    // handle relative paths
    if (_path.charAt(0) !== '/') {
      _was_relative = true;
      _path = '/' + _path;
    }

    // handle relative files (as opposed to directories)
    if (_path.slice(-3) === '/..' || _path.slice(-2) === '/.') {
      _path += '/';
    }

    // resolve simples
    _path = _path
      .replace(/(\/(\.\/)+)|(\/\.$)/g, '/')
      .replace(/\/{2,}/g, '/');

    // remember leading parents
    if (_was_relative) {
      _leadingParents = _path.substring(1).match(/^(\.\.\/)+/) || '';
      if (_leadingParents) {
        _leadingParents = _leadingParents[0];
      }
    }

    // resolve parents
    while (true) {
      _parent = _path.search(/\/\.\.(\/|$)/);
      if (_parent === -1) {
        // no more ../ to resolve
        break;
      } else if (_parent === 0) {
        // top level cannot be relative, skip it
        _path = _path.substring(3);
        continue;
      }

      _pos = _path.substring(0, _parent).lastIndexOf('/');
      if (_pos === -1) {
        _pos = _parent;
      }
      _path = _path.substring(0, _pos) + _path.substring(_parent + 3);
    }

    // revert to relative
    if (_was_relative && this.is('relative')) {
      _path = _leadingParents + _path.substring(1);
    }

    this._parts.path = _path;
    this.build(!build);
    return this;
  };
  p.normalizePathname = p.normalizePath;
  p.normalizeQuery = function(build) {
    if (typeof this._parts.query === 'string') {
      if (!this._parts.query.length) {
        this._parts.query = null;
      } else {
        this.query(URI.parseQuery(this._parts.query, this._parts.escapeQuerySpace));
      }

      this.build(!build);
    }

    return this;
  };
  p.normalizeFragment = function(build) {
    if (!this._parts.fragment) {
      this._parts.fragment = null;
      this.build(!build);
    }

    return this;
  };
  p.normalizeSearch = p.normalizeQuery;
  p.normalizeHash = p.normalizeFragment;

  p.iso8859 = function() {
    // expect unicode input, iso8859 output
    var e = URI.encode;
    var d = URI.decode;

    URI.encode = escape;
    URI.decode = decodeURIComponent;
    try {
      this.normalize();
    } finally {
      URI.encode = e;
      URI.decode = d;
    }
    return this;
  };

  p.unicode = function() {
    // expect iso8859 input, unicode output
    var e = URI.encode;
    var d = URI.decode;

    URI.encode = strictEncodeURIComponent;
    URI.decode = decodeURI;
    try {
      this.normalize();
    } finally {
      URI.encode = e;
      URI.decode = d;
    }
    return this;
  };

  p.readable = function() {
    var uri = this.clone();
    // removing username, password, because they shouldn't be displayed according to RFC 3986
    uri.username('').password('').normalize();
    var t = '';
    if (uri._parts.protocol) {
      t += uri._parts.protocol + '://';
    }

    if (uri._parts.hostname) {
      if (uri.is('punycode') && punycode) {
        t += punycode.toUnicode(uri._parts.hostname);
        if (uri._parts.port) {
          t += ':' + uri._parts.port;
        }
      } else {
        t += uri.host();
      }
    }

    if (uri._parts.hostname && uri._parts.path && uri._parts.path.charAt(0) !== '/') {
      t += '/';
    }

    t += uri.path(true);
    if (uri._parts.query) {
      var q = '';
      for (var i = 0, qp = uri._parts.query.split('&'), l = qp.length; i < l; i++) {
        var kv = (qp[i] || '').split('=');
        q += '&' + URI.decodeQuery(kv[0], this._parts.escapeQuerySpace)
          .replace(/&/g, '%26');

        if (kv[1] !== undefined) {
          q += '=' + URI.decodeQuery(kv[1], this._parts.escapeQuerySpace)
            .replace(/&/g, '%26');
        }
      }
      t += '?' + q.substring(1);
    }

    t += URI.decodeQuery(uri.hash(), true);
    return t;
  };

  // resolving relative and absolute URLs
  p.absoluteTo = function(base) {
    var resolved = this.clone();
    var properties = ['protocol', 'username', 'password', 'hostname', 'port'];
    var basedir, i, p;

    if (this._parts.urn) {
      throw new Error('URNs do not have any generally defined hierarchical components');
    }

    if (!(base instanceof URI)) {
      base = new URI(base);
    }

    if (resolved._parts.protocol) {
      // Directly returns even if this._parts.hostname is empty.
      return resolved;
    } else {
      resolved._parts.protocol = base._parts.protocol;
    }

    if (this._parts.hostname) {
      return resolved;
    }

    for (i = 0; (p = properties[i]); i++) {
      resolved._parts[p] = base._parts[p];
    }

    if (!resolved._parts.path) {
      resolved._parts.path = base._parts.path;
      if (!resolved._parts.query) {
        resolved._parts.query = base._parts.query;
      }
    } else {
      if (resolved._parts.path.substring(-2) === '..') {
        resolved._parts.path += '/';
      }

      if (resolved.path().charAt(0) !== '/') {
        basedir = base.directory();
        basedir = basedir ? basedir : base.path().indexOf('/') === 0 ? '/' : '';
        resolved._parts.path = (basedir ? (basedir + '/') : '') + resolved._parts.path;
        resolved.normalizePath();
      }
    }

    resolved.build();
    return resolved;
  };
  p.relativeTo = function(base) {
    var relative = this.clone().normalize();
    var relativeParts, baseParts, common, relativePath, basePath;

    if (relative._parts.urn) {
      throw new Error('URNs do not have any generally defined hierarchical components');
    }

    base = new URI(base).normalize();
    relativeParts = relative._parts;
    baseParts = base._parts;
    relativePath = relative.path();
    basePath = base.path();

    if (relativePath.charAt(0) !== '/') {
      throw new Error('URI is already relative');
    }

    if (basePath.charAt(0) !== '/') {
      throw new Error('Cannot calculate a URI relative to another relative URI');
    }

    if (relativeParts.protocol === baseParts.protocol) {
      relativeParts.protocol = null;
    }

    if (relativeParts.username !== baseParts.username || relativeParts.password !== baseParts.password) {
      return relative.build();
    }

    if (relativeParts.protocol !== null || relativeParts.username !== null || relativeParts.password !== null) {
      return relative.build();
    }

    if (relativeParts.hostname === baseParts.hostname && relativeParts.port === baseParts.port) {
      relativeParts.hostname = null;
      relativeParts.port = null;
    } else {
      return relative.build();
    }

    if (relativePath === basePath) {
      relativeParts.path = '';
      return relative.build();
    }

    // determine common sub path
    common = URI.commonPath(relativePath, basePath);

    // If the paths have nothing in common, return a relative URL with the absolute path.
    if (!common) {
      return relative.build();
    }

    var parents = baseParts.path
      .substring(common.length)
      .replace(/[^\/]*$/, '')
      .replace(/.*?\//g, '../');

    relativeParts.path = (parents + relativeParts.path.substring(common.length)) || './';

    return relative.build();
  };

  // comparing URIs
  p.equals = function(uri) {
    var one = this.clone();
    var two = new URI(uri);
    var one_map = {};
    var two_map = {};
    var checked = {};
    var one_query, two_query, key;

    one.normalize();
    two.normalize();

    // exact match
    if (one.toString() === two.toString()) {
      return true;
    }

    // extract query string
    one_query = one.query();
    two_query = two.query();
    one.query('');
    two.query('');

    // definitely not equal if not even non-query parts match
    if (one.toString() !== two.toString()) {
      return false;
    }

    // query parameters have the same length, even if they're permuted
    if (one_query.length !== two_query.length) {
      return false;
    }

    one_map = URI.parseQuery(one_query, this._parts.escapeQuerySpace);
    two_map = URI.parseQuery(two_query, this._parts.escapeQuerySpace);

    for (key in one_map) {
      if (hasOwn.call(one_map, key)) {
        if (!isArray(one_map[key])) {
          if (one_map[key] !== two_map[key]) {
            return false;
          }
        } else if (!arraysEqual(one_map[key], two_map[key])) {
          return false;
        }

        checked[key] = true;
      }
    }

    for (key in two_map) {
      if (hasOwn.call(two_map, key)) {
        if (!checked[key]) {
          // two contains a parameter not present in one
          return false;
        }
      }
    }

    return true;
  };

  // state
  p.duplicateQueryParameters = function(v) {
    this._parts.duplicateQueryParameters = !!v;
    return this;
  };

  p.escapeQuerySpace = function(v) {
    this._parts.escapeQuerySpace = !!v;
    return this;
  };

  return URI;
}));

/*!
 * URI.js - Mutating URLs
 * URI Template Support - http://tools.ietf.org/html/rfc6570
 *
 * Version: 1.18.10
 *
 * Author: Rodney Rehm
 * Web: http://medialize.github.io/URI.js/
 *
 * Licensed under
 *   MIT License http://www.opensource.org/licenses/mit-license
 *
 */
(function (root, factory) {
  'use strict';
  // https://github.com/umdjs/umd/blob/master/returnExports.js
  if (typeof module === 'object' && module.exports) {
    // Node
    module.exports = factory(require('./URI'));
  } else if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['./URI'], factory);
  } else {
    // Browser globals (root is window)
    root.URITemplate = factory(root.URI, root);
  }
}(this, function (URI, root) {
  'use strict';
  // FIXME: v2.0.0 renamce non-camelCase properties to uppercase
  /*jshint camelcase: false */

  // save current URITemplate variable, if any
  var _URITemplate = root && root.URITemplate;

  var hasOwn = Object.prototype.hasOwnProperty;
  function URITemplate(expression) {
    // serve from cache where possible
    if (URITemplate._cache[expression]) {
      return URITemplate._cache[expression];
    }

    // Allow instantiation without the 'new' keyword
    if (!(this instanceof URITemplate)) {
      return new URITemplate(expression);
    }

    this.expression = expression;
    URITemplate._cache[expression] = this;
    return this;
  }

  function Data(data) {
    this.data = data;
    this.cache = {};
  }

  var p = URITemplate.prototype;
  // list of operators and their defined options
  var operators = {
    // Simple string expansion
    '' : {
      prefix: '',
      separator: ',',
      named: false,
      empty_name_separator: false,
      encode : 'encode'
    },
    // Reserved character strings
    '+' : {
      prefix: '',
      separator: ',',
      named: false,
      empty_name_separator: false,
      encode : 'encodeReserved'
    },
    // Fragment identifiers prefixed by '#'
    '#' : {
      prefix: '#',
      separator: ',',
      named: false,
      empty_name_separator: false,
      encode : 'encodeReserved'
    },
    // Name labels or extensions prefixed by '.'
    '.' : {
      prefix: '.',
      separator: '.',
      named: false,
      empty_name_separator: false,
      encode : 'encode'
    },
    // Path segments prefixed by '/'
    '/' : {
      prefix: '/',
      separator: '/',
      named: false,
      empty_name_separator: false,
      encode : 'encode'
    },
    // Path parameter name or name=value pairs prefixed by ';'
    ';' : {
      prefix: ';',
      separator: ';',
      named: true,
      empty_name_separator: false,
      encode : 'encode'
    },
    // Query component beginning with '?' and consisting
    // of name=value pairs separated by '&'; an
    '?' : {
      prefix: '?',
      separator: '&',
      named: true,
      empty_name_separator: true,
      encode : 'encode'
    },
    // Continuation of query-style &name=value pairs
    // within a literal query component.
    '&' : {
      prefix: '&',
      separator: '&',
      named: true,
      empty_name_separator: true,
      encode : 'encode'
    }

    // The operator characters equals ("="), comma (","), exclamation ("!"),
    // at sign ("@"), and pipe ("|") are reserved for future extensions.
  };

  // storage for already parsed templates
  URITemplate._cache = {};
  // pattern to identify expressions [operator, variable-list] in template
  URITemplate.EXPRESSION_PATTERN = /\{([^a-zA-Z0-9%_]?)([^\}]+)(\}|$)/g;
  // pattern to identify variables [name, explode, maxlength] in variable-list
  URITemplate.VARIABLE_PATTERN = /^([^*:.](?:\.?[^*:.])*)((\*)|:(\d+))?$/;
  // pattern to verify variable name integrity
  URITemplate.VARIABLE_NAME_PATTERN = /[^a-zA-Z0-9%_.]/;
  // pattern to verify literal integrity
  URITemplate.LITERAL_PATTERN = /[<>{}"`^| \\]/;

  // expand parsed expression (expression, not template!)
  URITemplate.expand = function(expression, data, opts) {
    // container for defined options for the given operator
    var options = operators[expression.operator];
    // expansion type (include keys or not)
    var type = options.named ? 'Named' : 'Unnamed';
    // list of variables within the expression
    var variables = expression.variables;
    // result buffer for evaluating the expression
    var buffer = [];
    var d, variable, i;

    for (i = 0; (variable = variables[i]); i++) {
      // fetch simplified data source
      d = data.get(variable.name);
      if (d.type === 0 && opts && opts.strict) {
          throw new Error('Missing expansion value for variable "' + variable.name + '"');
      }
      if (!d.val.length) {
        if (d.type) {
          // empty variables (empty string)
          // still lead to a separator being appended!
          buffer.push('');
        }
        // no data, no action
        continue;
      }

      if (d.type > 1 && variable.maxlength) {
        // composite variable cannot specify maxlength
        throw new Error('Invalid expression: Prefix modifier not applicable to variable "' + variable.name + '"');
      }

      // expand the given variable
      buffer.push(URITemplate['expand' + type](
        d,
        options,
        variable.explode,
        variable.explode && options.separator || ',',
        variable.maxlength,
        variable.name
      ));
    }

    if (buffer.length) {
      return options.prefix + buffer.join(options.separator);
    } else {
      // prefix is not prepended for empty expressions
      return '';
    }
  };
  // expand a named variable
  URITemplate.expandNamed = function(d, options, explode, separator, length, name) {
    // variable result buffer
    var result = '';
    // peformance crap
    var encode = options.encode;
    var empty_name_separator = options.empty_name_separator;
    // flag noting if values are already encoded
    var _encode = !d[encode].length;
    // key for named expansion
    var _name = d.type === 2 ? '': URI[encode](name);
    var _value, i, l;

    // for each found value
    for (i = 0, l = d.val.length; i < l; i++) {
      if (length) {
        // maxlength must be determined before encoding can happen
        _value = URI[encode](d.val[i][1].substring(0, length));
        if (d.type === 2) {
          // apply maxlength to keys of objects as well
          _name = URI[encode](d.val[i][0].substring(0, length));
        }
      } else if (_encode) {
        // encode value
        _value = URI[encode](d.val[i][1]);
        if (d.type === 2) {
          // encode name and cache encoded value
          _name = URI[encode](d.val[i][0]);
          d[encode].push([_name, _value]);
        } else {
          // cache encoded value
          d[encode].push([undefined, _value]);
        }
      } else {
        // values are already encoded and can be pulled from cache
        _value = d[encode][i][1];
        if (d.type === 2) {
          _name = d[encode][i][0];
        }
      }

      if (result) {
        // unless we're the first value, prepend the separator
        result += separator;
      }

      if (!explode) {
        if (!i) {
          // first element, so prepend variable name
          result += URI[encode](name) + (empty_name_separator || _value ? '=' : '');
        }

        if (d.type === 2) {
          // without explode-modifier, keys of objects are returned comma-separated
          result += _name + ',';
        }

        result += _value;
      } else {
        // only add the = if it is either default (?&) or there actually is a value (;)
        result += _name + (empty_name_separator || _value ? '=' : '') + _value;
      }
    }

    return result;
  };
  // expand an unnamed variable
  URITemplate.expandUnnamed = function(d, options, explode, separator, length) {
    // variable result buffer
    var result = '';
    // performance crap
    var encode = options.encode;
    var empty_name_separator = options.empty_name_separator;
    // flag noting if values are already encoded
    var _encode = !d[encode].length;
    var _name, _value, i, l;

    // for each found value
    for (i = 0, l = d.val.length; i < l; i++) {
      if (length) {
        // maxlength must be determined before encoding can happen
        _value = URI[encode](d.val[i][1].substring(0, length));
      } else if (_encode) {
        // encode and cache value
        _value = URI[encode](d.val[i][1]);
        d[encode].push([
          d.type === 2 ? URI[encode](d.val[i][0]) : undefined,
          _value
        ]);
      } else {
        // value already encoded, pull from cache
        _value = d[encode][i][1];
      }

      if (result) {
        // unless we're the first value, prepend the separator
        result += separator;
      }

      if (d.type === 2) {
        if (length) {
          // maxlength also applies to keys of objects
          _name = URI[encode](d.val[i][0].substring(0, length));
        } else {
          // at this point the name must already be encoded
          _name = d[encode][i][0];
        }

        result += _name;
        if (explode) {
          // explode-modifier separates name and value by "="
          result += (empty_name_separator || _value ? '=' : '');
        } else {
          // no explode-modifier separates name and value by ","
          result += ',';
        }
      }

      result += _value;
    }

    return result;
  };

  URITemplate.noConflict = function() {
    if (root.URITemplate === URITemplate) {
      root.URITemplate = _URITemplate;
    }

    return URITemplate;
  };

  // expand template through given data map
  p.expand = function(data, opts) {
    var result = '';

    if (!this.parts || !this.parts.length) {
      // lazilyy parse the template
      this.parse();
    }

    if (!(data instanceof Data)) {
      // make given data available through the
      // optimized data handling thingie
      data = new Data(data);
    }

    for (var i = 0, l = this.parts.length; i < l; i++) {
      /*jshint laxbreak: true */
      result += typeof this.parts[i] === 'string'
        // literal string
        ? this.parts[i]
        // expression
        : URITemplate.expand(this.parts[i], data, opts);
      /*jshint laxbreak: false */
    }

    return result;
  };
  // parse template into action tokens
  p.parse = function() {
    // performance crap
    var expression = this.expression;
    var ePattern = URITemplate.EXPRESSION_PATTERN;
    var vPattern = URITemplate.VARIABLE_PATTERN;
    var nPattern = URITemplate.VARIABLE_NAME_PATTERN;
    var lPattern = URITemplate.LITERAL_PATTERN;
    // token result buffer
    var parts = [];
      // position within source template
    var pos = 0;
    var variables, eMatch, vMatch;

    var checkLiteral = function(literal) {
      if (literal.match(lPattern)) {
        throw new Error('Invalid Literal "' + literal + '"');
      }
      return literal;
    };

    // RegExp is shared accross all templates,
    // which requires a manual reset
    ePattern.lastIndex = 0;
    // I don't like while(foo = bar()) loops,
    // to make things simpler I go while(true) and break when required
    while (true) {
      eMatch = ePattern.exec(expression);
      if (eMatch === null) {
        // push trailing literal
        parts.push(checkLiteral(expression.substring(pos)));
        break;
      } else {
        // push leading literal
        parts.push(checkLiteral(expression.substring(pos, eMatch.index)));
        pos = eMatch.index + eMatch[0].length;
      }

      if (!operators[eMatch[1]]) {
        throw new Error('Unknown Operator "' + eMatch[1]  + '" in "' + eMatch[0] + '"');
      } else if (!eMatch[3]) {
        throw new Error('Unclosed Expression "' + eMatch[0]  + '"');
      }

      // parse variable-list
      variables = eMatch[2].split(',');
      for (var i = 0, l = variables.length; i < l; i++) {
        vMatch = variables[i].match(vPattern);
        if (vMatch === null) {
          throw new Error('Invalid Variable "' + variables[i] + '" in "' + eMatch[0] + '"');
        } else if (vMatch[1].match(nPattern)) {
          throw new Error('Invalid Variable Name "' + vMatch[1] + '" in "' + eMatch[0] + '"');
        }

        variables[i] = {
          name: vMatch[1],
          explode: !!vMatch[3],
          maxlength: vMatch[4] && parseInt(vMatch[4], 10)
        };
      }

      if (!variables.length) {
        throw new Error('Expression Missing Variable(s) "' + eMatch[0] + '"');
      }

      parts.push({
        expression: eMatch[0],
        operator: eMatch[1],
        variables: variables
      });
    }

    if (!parts.length) {
      // template doesn't contain any expressions
      // so it is a simple literal string
      // this probably should fire a warning or something?
      parts.push(checkLiteral(expression));
    }

    this.parts = parts;
    return this;
  };

  // simplify data structures
  Data.prototype.get = function(key) {
    // performance crap
    var data = this.data;
    // cache for processed data-point
    var d = {
      // type of data 0: undefined/null, 1: string, 2: object, 3: array
      type: 0,
      // original values (except undefined/null)
      val: [],
      // cache for encoded values (only for non-maxlength expansion)
      encode: [],
      encodeReserved: []
    };
    var i, l, value;

    if (this.cache[key] !== undefined) {
      // we've already processed this key
      return this.cache[key];
    }

    this.cache[key] = d;

    if (String(Object.prototype.toString.call(data)) === '[object Function]') {
      // data itself is a callback (global callback)
      value = data(key);
    } else if (String(Object.prototype.toString.call(data[key])) === '[object Function]') {
      // data is a map of callbacks (local callback)
      value = data[key](key);
    } else {
      // data is a map of data
      value = data[key];
    }

    // generalize input into [ [name1, value1], [name2, value2], … ]
    // so expansion has to deal with a single data structure only
    if (value === undefined || value === null) {
      // undefined and null values are to be ignored completely
      return d;
    } else if (String(Object.prototype.toString.call(value)) === '[object Array]') {
      for (i = 0, l = value.length; i < l; i++) {
        if (value[i] !== undefined && value[i] !== null) {
          // arrays don't have names
          d.val.push([undefined, String(value[i])]);
        }
      }

      if (d.val.length) {
        // only treat non-empty arrays as arrays
        d.type = 3; // array
      }
    } else if (String(Object.prototype.toString.call(value)) === '[object Object]') {
      for (i in value) {
        if (hasOwn.call(value, i) && value[i] !== undefined && value[i] !== null) {
          // objects have keys, remember them for named expansion
          d.val.push([i, String(value[i])]);
        }
      }

      if (d.val.length) {
        // only treat non-empty objects as objects
        d.type = 2; // object
      }
    } else {
      d.type = 1; // primitive string (could've been string, number, boolean and objects with a toString())
      // arrays don't have names
      d.val.push([undefined, String(value)]);
    }

    return d;
  };

  // hook into URI for fluid access
  URI.expand = function(expression, data) {
    var template = new URITemplate(expression);
    var expansion = template.expand(data);

    return new URI(expansion);
  };

  return URITemplate;
}));

/**
 * Aja.js
 * Ajax without XML : Asynchronous Javascript and JavaScript/JSON(P)
 *
 * @author Bertrand Chevrier <chevrier.bertrand@gmail.com>
 * @license MIT
 */
(function(){
    'use strict';

    /**
     * supported request types.
     * TODO support new types : 'style', 'file'?
     */
    var types = ['html', 'json', 'jsonp', 'script'];

    /**
     * supported http methods
     */
    var methods = [
        'connect',
        'delete',
        'get',
        'head',
        'options',
        'patch',
        'post',
        'put',
        'trace'
    ];

    /**
     * API entry point.
     * It creates an new {@link Aja} object.
     *
     * @example aja().url('page.html').into('#selector').go();
     *
     * @exports aja
     * @namespace aja
     * @returns {Aja} the {@link Aja} object ready to create your request.
     */
    var aja = function aja(){

        //contains all the values from the setter for this context.
        var data = {};

        //contains the bound events.
        var events = {};

        /**
         * The Aja object is your context, it provides your getter/setter
         * as well as methods the fluent way.
         * @typedef {Object} Aja
         */

        /**
         * @type {Aja}
         * @lends aja
         */
        var Aja = {

            /**
             * URL getter/setter: where your request goes.
             * All URL formats are supported: <pre>[protocol:][//][user[:passwd]@][host.tld]/path[?query][#hash]</pre>.
             *
             * @example aja().url('bestlib?pattern=aja');
             *
             * @throws TypeError
             * @param {String} [url] - the url to set
             * @returns {Aja|String} chains or get the URL
             */
            url : function(url){
               return _chain.call(this, 'url', url, validators.string);
            },

            /**
             * Is the request synchronous (async by default) ?
             *
             * @example aja().sync(true);
             *
             * @param {Boolean|*} [sync] - true means sync (other types than booleans are casted)
             * @returns {Aja|Boolean} chains or get the sync value
             */
            sync : function(sync){
               return _chain.call(this, 'sync', sync, validators.bool);
            },

            /**
             * Should we force to disable browser caching (true by default) ?
             * By setting this to false, then a buster will be added to the requests.
             *
             * @example aja().cache(false);
             *
             * @param {Boolean|*} [cache] - false means no cache  (other types than booleans are casted)
             * @returns {Aja|Boolean} chains or get cache value
             */
            cache : function(cache){
               return _chain.call(this, 'cache', cache, validators.bool);
            },

            /**
             * Type getter/setter: one of the predefined request type.
             * The supported types are : <pre>['html', 'json', 'jsonp', 'script', 'style']</pre>.
             * If not set, the default type is deduced regarding the context, but goes to json otherwise.
             *
             * @example aja().type('json');
             *
             * @throws TypeError if an unknown type is set
             * @param {String} [type] - the type to set
             * @returns {Aja|String} chains or get the type
             */
            type : function(type){
               return _chain.call(this, 'type', type, validators.type);
            },

            /**
             * HTTP Request Header getter/setter.
             *
             * @example aja().header('Content-Type', 'application/json');
             *
             * @throws TypeError
             * @param {String} name - the name of the header to get/set
             * @param {String} [value] - the value of the header to set
             * @returns {Aja|String} chains or get the header from the given name
             */
            header : function(name, value){
                data.headers = data.headers || {};

                validators.string(name);
                if(typeof value !== 'undefined'){
                    validators.string(value);

                    data.headers[name] = value;

                    return this;
                }

                return data.headers[name];
            },

            /**
             * <strong>Setter only</strong> to add authentication credentials to the request.
             *
             * @throws TypeError
             * @param {String} user - the user name
             * @param {String} passwd - the password value
             * @returns {Aja} chains
             */
            auth : function(user, passwd){
                //setter only

                validators.string(user);
                validators.string(passwd);
                data.auth = {
                   user : user,
                   passwd : passwd
                };

                return this;
            },

            /**
             * Sets a timeout (expressed in ms) after which it will halt the request and the 'timeout' event will be fired.
             *
             * @example aja().timeout(1000); // Terminate the request and fire the 'timeout' event after 1s
             *
             * @throws TypeError
             * @param {Number} [ms] - timeout in ms to set. It has to be an integer > 0.
             * @returns {Aja|String} chains or get the params
             */
            timeout : function(ms){
                return _chain.call(this, 'timeout', ms, validators.positiveInteger);
            },

            /**
             * HTTP method getter/setter.
             *
             * @example aja().method('post');
             *
             * @throws TypeError if an unknown method is set
             * @param {String} [method] - the method to set
             * @returns {Aja|String} chains or get the method
             */
            method : function(method){
               return _chain.call(this, 'method', method, validators.method);
            },

            /**
             * URL's queryString getter/setter. The parameters are ALWAYS appended to the URL.
             *
             * @example aja().queryString({ user : '12' }); //  ?user=12
             *
             * @throws TypeError
             * @param {Object|String} [params] - key/values POJO or URL queryString directly to set
             * @returns {Aja|String} chains or get the params
             */
            queryString : function(params){
               return _chain.call(this, 'queryString', params, validators.queryString);
            },

            /**
             * URL's queryString getter/setter.
             * Regarding the HTTP method the data goes to the queryString or the body.
             *
             * @example aja().data({ user : '12' });
             *
             * @throws TypeError
             * @param {Object} [params] - key/values POJO to set
             * @returns {Aja|String} chains or get the params
             */
            data : function(params){
               return _chain.call(this, 'data', params, validators.plainObject);
            },

            /**
             * Request Body getter/setter.
             * Objects and arrays are stringified (except FormData instances)
             *
             * @example aja().body(new FormData());
             *
             * @throws TypeError
             * @param {String|Object|Array|Boolean|Number|FormData} [content] - the content value to set
             * @returns {Aja|String|FormData} chains or get the body content
             */
            body : function(content){
                return _chain.call(this, 'body', content, null, function(content){
                   if(typeof content === 'object'){
                        //support FormData to be sent direclty
                        if( !(content instanceof FormData)){
                            //otherwise encode the object/array to a string
                            try {
                                content = JSON.stringify(content);
                            } catch(e){
                                throw new TypeError('Unable to stringify body\'s content : ' + e.name);
                            }
                            this.header('Content-Type', 'application/json');
                        }
                   } else {
                        content = content + ''; //cast
                   }
                   return content;
                });
            },

            /**
             * Into selector getter/setter. When you want an Element to contain the response.
             *
             * @example aja().into('div > .container');
             *
             * @throws TypeError
             * @param {String|HTMLElement} [selector] - the dom query selector or directly the Element
             * @returns {Aja|Array} chains or get the list of found elements
             */
            into : function(selector){
                return _chain.call(this, 'into', selector, validators.selector, function(selector){
                    if(typeof selector === 'string'){
                        return document.querySelectorAll(selector);
                    }
                    if(selector instanceof HTMLElement){
                        return [selector];
                    }
                });
            },

            /**
             * Padding name getter/setter, ie. the callback's PARAMETER name in your JSONP query.
             *
             * @example aja().jsonPaddingName('callback');
             *
             * @throws TypeError
             * @param {String} [paramName] - a valid parameter name
             * @returns {Aja|String} chains or get the parameter name
             */
            jsonPaddingName : function(paramName){
                return _chain.call(this, 'jsonPaddingName', paramName, validators.string);
            },

            /**
             * Padding value  getter/setter, ie. the callback's name in your JSONP query.
             *
             * @example aja().jsonPadding('someFunction');
             *
             * @throws TypeError
             * @param {String} [padding] - a valid function name
             * @returns {Aja|String} chains or get the padding name
             */
            jsonPadding : function(padding){
                return _chain.call(this, 'jsonPadding', padding, validators.func);
            },

            /**
             * Attach an handler to an event.
             * Calling `on` with the same eventName multiple times add callbacks: they
             * will all be executed.
             *
             * @example aja().on('success', function(res){ console.log('Cool', res);  });
             *
             * @param {String} name - the name of the event to listen
             * @param {Function} cb - the callback to run once the event is triggered
             * @returns {Aja} chains
             */
            on : function(name, cb){
                if(typeof cb === 'function'){
                    events[name] = events[name] || [];
                    events[name].push(cb);
                }
                return this;
            },

            /**
             * Remove ALL handlers for an event.
             *
             * @example aja().off('success');
             *
             * @param {String} name - the name of the event
             * @returns {Aja} chains
             */
            off : function(name){
                events[name] = [];
                return this;
            },

            /**
             * Trigger an event.
             * This method will be called hardly ever outside Aja itself,
             * but there is edge cases where it can be useful.
             *
             * @example aja().trigger('error', new Error('Emergency alert'));
             *
             * @param {String} name - the name of the event to trigger
             * @param {*} data - arguments given to the handlers
             * @returns {Aja} chains
             */
            trigger : function(name, data){
                var self = this;
                var eventCalls  = function eventCalls(name, data){
                    if(events[name] instanceof Array){
                        events[name].forEach(function(event){
                            event.call(self, data);
                        });
                    }
                };
                if(typeof name !== 'undefined'){
                    name = name + '';
                    var statusPattern = /^([0-9])([0-9x])([0-9x])$/i;
                    var triggerStatus = name.match(statusPattern);

                    //HTTP status pattern
                    if(triggerStatus && triggerStatus.length > 3){
                        Object.keys(events).forEach(function(eventName){
                            var listenerStatus = eventName.match(statusPattern);
                            if(listenerStatus && listenerStatus.length > 3 &&       //an listener on status
                                triggerStatus[1] === listenerStatus[1] &&           //hundreds match exactly
                                (listenerStatus[2] === 'x' ||  triggerStatus[2] === listenerStatus[2]) && //tens matches
                                (listenerStatus[3] === 'x' ||  triggerStatus[3] === listenerStatus[3])){ //ones matches

                                eventCalls(eventName, data);
                            }
                        });
                    //or exact matching
                    } else if(events[name]){
                       eventCalls(name, data);
                    }
                }
                return this;
            },

            /**
             * Trigger the call.
             * This is the end of your chain loop.
             *
             * @example aja()
             *           .url('data.json')
             *           .on('200', function(res){
             *               //Yeah !
             *            })
             *           .go();
             */
            go : function(){

                var type    = data.type || (data.into ? 'html' : 'json');
                var url     = _buildQuery();

                //delegates to ajaGo
                if(typeof ajaGo[type] === 'function'){
                    return ajaGo[type].call(this, url);
                }
            }
        };

        /**
         * Contains the different communication methods.
         * Used as provider by {@link Aja.go}
         *
         * @type {Object}
         * @private
         * @memberof aja
         */
        var ajaGo = {

            /**
             * XHR call to url to retrieve JSON
             * @param {String} url - the url
             */
            json : function(url){
                var self = this;

               ajaGo._xhr.call(this, url, function processRes(res){
                    if(res){
                        try {
                            res = JSON.parse(res);
                        } catch(e){
                            self.trigger('error', e);
                            return null;
                        }
                    }
                    return res;
                });
            },

            /**
             * XHR call to url to retrieve HTML and add it to a container if set.
             * @param {String} url - the url
             */
            html : function(url){
                ajaGo._xhr.call(this, url, function processRes(res){
                    if(data.into && data.into.length){
                        [].forEach.call(data.into, function(elt){
                            elt.innerHTML = res;
                        });
                    }
                    return res;
                });
            },

            /**
             * Create and send an XHR query.
             * @param {String} url - the url
             * @param {Function} processRes - to modify / process the response before sent to events.
             */
            _xhr : function(url, processRes){
                var self = this;

                //iterators
                var key, header;

                var method      = data.method || 'get';
                var async       = data.sync !== true;
                var request     = new XMLHttpRequest();
                var _data       = data.data;
                var body        = data.body;
                var headers     = data.headers || {};
                var contentType = this.header('Content-Type');
                var timeout     = data.timeout;
                var timeoutId;
                var isUrlEncoded;
                var openParams;

                //guess content type
                if(!contentType && _data && _dataInBody()){
                    this.header('Content-Type', 'application/x-www-form-urlencoded;charset=utf-8');
                    contentType = this.header('Content-Type');
                }

                //if data is used in body, it needs some modifications regarding the content type
                if(_data && _dataInBody()){
                    if(typeof body !== 'string'){
                        body = '';
                    }

                    if(contentType.indexOf('json') > -1){
                        try {
                            body = JSON.stringify(_data);
                        } catch(e){
                            throw new TypeError('Unable to stringify body\'s content : ' + e.name);
                        }
                    } else {
                        isUrlEncoded = contentType && contentType.indexOf('x-www-form-urlencoded') > 1;
                        for(key in _data){
                            if(isUrlEncoded){
                                body += encodeURIComponent(key) + '=' + encodeURIComponent(_data[key]) + '&';
                            } else {
                                body += key + '=' + _data[key] + '\n\r';
                            }
                        }
                    }
                }

                //open the XHR request
                openParams = [method, url, async];
                if(data.auth){
                    openParams.push(data.auth.user);
                    openParams.push(data.auth.passwd);
                }
                request.open.apply(request, openParams);

                //set the headers
                for(header in data.headers){
                    request.setRequestHeader(header, data.headers[header]);
                }

                //bind events
                request.onprogress = function(e){
                    if (e.lengthComputable) {
                        self.trigger('progress', e.loaded / e.total);
                    }
                };

                request.onload = function onRequestLoad(){
                    var response = request.responseText;

                    if (timeoutId) {
                        clearTimeout(timeoutId);
                    }
                    if(this.status >= 200 && this.status < 300){
                        if(typeof processRes === 'function'){
                            response = processRes(response);
                        }
                        self.trigger('success', response);
                    }

                    self.trigger(this.status, response);

                    self.trigger('end', response);
                };

                request.onerror = function onRequestError (err){
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                    }
                    self.trigger('error', err, arguments);
                };

                //sets the timeout
                if (timeout) {
                    timeoutId = setTimeout(function() {
                        self.trigger('timeout', {
                            type: 'timeout',
                            expiredAfter: timeout
                        }, request, arguments);
                        request.abort();
                    }, timeout);
                }

                //send the request
                request.send(body);
            },

            /**
             * @this {Aja} call bound to the Aja context
             * @param {String} url - the url
             */
            jsonp : function(url){
                var script;
                var self            = this;
                var head            = document.querySelector('head');
                var async           = data.sync !== true;
                var jsonPaddingName = data.jsonPaddingName || 'callback';
                var jsonPadding     = data.jsonPadding || ('_padd' + new Date().getTime() + Math.floor(Math.random() * 10000));
                var paddingQuery    = {};

                if(aja[jsonPadding]){
                    throw new Error('Padding ' + jsonPadding + '  already exists. It must be unique.');
                }
                if(!/^ajajsonp_/.test(jsonPadding)){
                    jsonPadding = 'ajajsonp_' + jsonPadding;
                }

                //window.ajajsonp = window.ajajsonp || {};
                window[jsonPadding] = function padding (response){
                    self.trigger('success', response);
                    head.removeChild(script);
                    window[jsonPadding] = undefined;
                };

                paddingQuery[jsonPaddingName] = jsonPadding;

                url =  appendQueryString(url, paddingQuery);

                script = document.createElement('script');
                script.async = async;
                script.src = url;
                script.onerror = function(){
                    self.trigger('error', arguments);
                    head.removeChild(script);
                    window[jsonPadding] = undefined;
                };
                head.appendChild(script);
            },

            /**
             * Loads a script.
             *
             * This kind of ugly script loading is sometimes used by 3rd part libraries to load
             * a configured script. For example, to embed google analytics or a twitter button.
             *
             * @this {Aja} call bound to the Aja context
             * @param {String} url - the url
             */
            script : function(url){

                var self    = this;
                var head    = document.querySelector('head') || document.querySelector('body');
                var async   = data.sync !== true;
                var script;

                if(!head){
                    throw new Error('Ok, wait a second, you want to load a script, but you don\'t have at least a head or body tag...');
                }

                script = document.createElement('script');
                script.async = async;
                script.src = url;
                script.onerror = function onScriptError(){
                    self.trigger('error', arguments);
                    head.removeChild(script);
                };
                script.onload = function onScriptLoad(){
                    self.trigger('success', arguments);
                };

                head.appendChild(script);
            }
        };

        /**
         * Helps you to chain getter/setters.
         * @private
         * @memberof aja
         * @this {Aja} bound to the current context
         * @param {String} name - the property name
         * @param {*} [value] - the property value if we are in a setter
         * @param {Function} [validator] - to validate/transform the value if needed
         * @param {Function} [update] - when there is more to do with the setter
         * @returns {Aja|*} either the current context (setter) or the requested value (getter)
         * @throws TypeError
         */
        var _chain = function _chain(name, value, validator, update){
            if(typeof value !== 'undefined'){
                if(typeof validator === 'function'){
                    try{
                        value = validator.call(validators, value);
                    } catch(e){
                        throw new TypeError('Failed to set ' + name + ' : ' + e.message);
                    }
                }
                if(typeof update === 'function'){
                    data[name] = update.call(this, value);
                } else {
                    data[name] = value;
                }
                return this;
            }
            return data[name] === 'undefined' ? null : data[name];
        };

        /**
         * Check whether the data must be set in the body instead of the queryString
         * @private
         * @memberof aja
         * @returns {Boolean} true id data goes to the body
         */
        var _dataInBody = function _dataInBody(){
            return ['delete', 'patch', 'post', 'put'].indexOf(data.method) > -1;
        };

        /**
         * Build the URL to run the request against.
         * @private
         * @memberof aja
         * @returns {String} the URL
         */
        var _buildQuery = function _buildQuery(){

            var url         = data.url;
            var cache       = typeof data.cache !== 'undefined' ? !!data.cache : true;
            var queryString = data.queryString || '';
            var _data       = data.data;

            //add a cache buster
            if(cache === false){
               queryString += '&ajabuster=' + new Date().getTime();
            }

            url = appendQueryString(url, queryString);

            if(_data && !_dataInBody()){
               url =  appendQueryString(url, _data);
            }
            return url;
        };

        //expose the Aja function
        return Aja;
    };

    /**
     * Validation/reparation rules for Aja's getter/setter.
     */
    var validators = {

        /**
         * cast to boolean
         * @param {*} value
         * @returns {Boolean} casted value
         */
        bool : function(value){
            return !!value;
        },

        /**
         * Check whether the given parameter is a string
         * @param {String} string
         * @returns {String} value
         * @throws {TypeError} for non strings
         */
        string : function(string){
            if(typeof string !== 'string'){
                throw new TypeError('a string is expected, but ' + string + ' [' + (typeof string) + '] given');
            }
            return string;
        },

        /**
         * Check whether the given parameter is a positive integer > 0
         * @param {Number} integer
         * @returns {Number} value
         * @throws {TypeError} for non strings
         */
        positiveInteger : function(integer){
            if(parseInt(integer) !== integer || integer <= 0){
                throw new TypeError('an integer is expected, but ' + integer + ' [' + (typeof integer) + '] given');
            }
            return integer;
        },

        /**
         * Check whether the given parameter is a plain object (array and functions aren't accepted)
         * @param {Object} object
         * @returns {Object} object
         * @throws {TypeError} for non object
         */
        plainObject : function(object){
            if(typeof object !== 'object' || object.constructor !== Object){
                throw new TypeError('an object is expected, but ' + object + '  [' + (typeof object) + '] given');
            }
            return object;
        },

        /**
         * Check whether the given parameter is a type supported by Aja.
         * The list of supported types is set above, in the {@link types} variable.
         * @param {String} type
         * @returns {String} type
         * @throws {TypeError} if the type isn't supported
         */
        type : function(type){
            type = this.string(type);
            if(types.indexOf(type.toLowerCase()) < 0){
                throw new TypeError('a type in [' + types.join(', ') + '] is expected, but ' + type + ' given');
            }
            return type.toLowerCase();
        },

        /**
         * Check whether the given HTTP method is supported.
         * The list of supported methods is set above, in the {@link methods} variable.
         * @param {String} method
         * @returns {String} method (but to lower case)
         * @throws {TypeError} if the method isn't supported
         */
        method : function(method){
            method = this.string(method);
            if(methods.indexOf(method.toLowerCase()) < 0){
                throw new TypeError('a method in [' + methods.join(', ') + '] is expected, but ' + method + ' given');
            }
            return method.toLowerCase();
        },

        /**
         * Check the queryString, and create an object if a string is given.
         *
         * @param {String|Object} params
         * @returns {Object} key/value based queryString
         * @throws {TypeError} if wrong params type or if the string isn't parseable
         */
        queryString : function(params){
            var object = {};
            if(typeof params === 'string'){

               params.replace('?', '').split('&').forEach(function(kv){
                    var pair = kv.split('=');
                    if(pair.length === 2){
                        object[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1]);
                    }
               });
            } else {
                object = params;
            }
            return this.plainObject(object);
        },

        /**
         * Check if the parameter enables us to select a DOM Element.
         *
         * @param {String|HTMLElement} selector - CSS selector or the element ref
         * @returns {String|HTMLElement} same as input if valid
         * @throws {TypeError} check it's a string or an HTMLElement
         */
        selector : function(selector){
            if(typeof selector !== 'string' && !(selector instanceof HTMLElement)){
                throw new TypeError('a selector or an HTMLElement is expected, ' + selector + ' [' + (typeof selector) + '] given');
            }
            return selector;
        },

        /**
         * Check if the parameter is a valid JavaScript function name.
         *
         * @param {String} functionName
         * @returns {String} same as input if valid
         * @throws {TypeError} check it's a string and a valid name against the pattern inside.
         */
        func : function(functionName){
            functionName = this.string(functionName);
            if(!/^([a-zA-Z_])([a-zA-Z0-9_\-])+$/.test(functionName)){
                throw new TypeError('a valid function name is expected, ' + functionName + ' [' + (typeof functionName) + '] given');
            }
            return functionName;
         }
    };

    /**
     * Query string helper : append some parameters
     * @private
     * @param {String} url - the URL to append the parameters
     * @param {Object} params - key/value
     * @returns {String} the new URL
     */
    var appendQueryString = function appendQueryString(url, params){
        var key;
        url = url || '';
        if(params){
            if(url.indexOf('?') === -1){
                url += '?';
            }
            if(typeof params === 'string'){
                url += params;
            } else if (typeof params === 'object'){
                for(key in params){
                    url += '&' + encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
                }
            }
        }

        return url;
    };

    //AMD, CommonJs, then globals
    if (typeof define === 'function' && define.amd) {
        define([], function(){
            return aja;
        });
    } else if (typeof exports === 'object') {
        module.exports = aja;
    } else {
        window.aja = window.aja || aja;
    }

}());

(function(root) {

	// Store setTimeout reference so promise-polyfill will be unaffected by
	// other code modifying setTimeout (like sinon.useFakeTimers())
	var setTimeoutFunc = setTimeout;

	// Use polyfill for setImmediate for performance gains
	var asap = (typeof setImmediate === 'function' && setImmediate) ||
		function(fn) { setTimeoutFunc(fn, 1); };

	// Polyfill for Function.prototype.bind
	function bind(fn, thisArg) {
		return function() {
			fn.apply(thisArg, arguments);
		}
	}

	var isArray = Array.isArray || function(value) { return Object.prototype.toString.call(value) === "[object Array]" };

	function Promise(fn) {
		if (typeof this !== 'object') throw new TypeError('Promises must be constructed via new');
		if (typeof fn !== 'function') throw new TypeError('not a function');
		this._state = null;
		this._value = null;
		this._deferreds = []

		doResolve(fn, bind(resolve, this), bind(reject, this))
	}

	function handle(deferred) {
		var me = this;
		if (this._state === null) {
			this._deferreds.push(deferred);
			return
		}
		asap(function() {
			var cb = me._state ? deferred.onFulfilled : deferred.onRejected
			if (cb === null) {
				(me._state ? deferred.resolve : deferred.reject)(me._value);
				return;
			}
			var ret;
			try {
				ret = cb(me._value);
			}
			catch (e) {
				deferred.reject(e);
				return;
			}
			deferred.resolve(ret);
		})
	}

	function resolve(newValue) {
		try { //Promise Resolution Procedure: https://github.com/promises-aplus/promises-spec#the-promise-resolution-procedure
			if (newValue === this) throw new TypeError('A promise cannot be resolved with itself.');
			if (newValue && (typeof newValue === 'object' || typeof newValue === 'function')) {
				var then = newValue.then;
				if (typeof then === 'function') {
					doResolve(bind(then, newValue), bind(resolve, this), bind(reject, this));
					return;
				}
			}
			this._state = true;
			this._value = newValue;
			finale.call(this);
		} catch (e) { reject.call(this, e); }
	}

	function reject(newValue) {
		this._state = false;
		this._value = newValue;
		finale.call(this);
	}

	function finale() {
		for (var i = 0, len = this._deferreds.length; i < len; i++) {
			handle.call(this, this._deferreds[i]);
		}
		this._deferreds = null;
	}

	function Handler(onFulfilled, onRejected, resolve, reject){
		this.onFulfilled = typeof onFulfilled === 'function' ? onFulfilled : null;
		this.onRejected = typeof onRejected === 'function' ? onRejected : null;
		this.resolve = resolve;
		this.reject = reject;
	}

	/**
	 * Take a potentially misbehaving resolver function and make sure
	 * onFulfilled and onRejected are only called once.
	 *
	 * Makes no guarantees about asynchrony.
	 */
	function doResolve(fn, onFulfilled, onRejected) {
		var done = false;
		try {
			fn(function (value) {
				if (done) return;
				done = true;
				onFulfilled(value);
			}, function (reason) {
				if (done) return;
				done = true;
				onRejected(reason);
			})
		} catch (ex) {
			if (done) return;
			done = true;
			onRejected(ex);
		}
	}

	Promise.prototype['catch'] = function (onRejected) {
		return this.then(null, onRejected);
	};

	Promise.prototype.then = function(onFulfilled, onRejected) {
		var me = this;
		return new Promise(function(resolve, reject) {
			handle.call(me, new Handler(onFulfilled, onRejected, resolve, reject));
		})
	};

	Promise.all = function () {
		var args = Array.prototype.slice.call(arguments.length === 1 && isArray(arguments[0]) ? arguments[0] : arguments);

		return new Promise(function (resolve, reject) {
			if (args.length === 0) return resolve([]);
			var remaining = args.length;
			function res(i, val) {
				try {
					if (val && (typeof val === 'object' || typeof val === 'function')) {
						var then = val.then;
						if (typeof then === 'function') {
							then.call(val, function (val) { res(i, val) }, reject);
							return;
						}
					}
					args[i] = val;
					if (--remaining === 0) {
						resolve(args);
					}
				} catch (ex) {
					reject(ex);
				}
			}
			for (var i = 0; i < args.length; i++) {
				res(i, args[i]);
			}
		});
	};

	Promise.resolve = function (value) {
		if (value && typeof value === 'object' && value.constructor === Promise) {
			return value;
		}

		return new Promise(function (resolve) {
			resolve(value);
		});
	};

	Promise.reject = function (value) {
		return new Promise(function (resolve, reject) {
			reject(value);
		});
	};

	Promise.race = function (values) {
		return new Promise(function (resolve, reject) {
			for(var i = 0, len = values.length; i < len; i++) {
				values[i].then(resolve, reject);
			}
		});
	};

	/**
	 * Set the immediate function to execute callbacks
	 * @param fn {function} Function to execute
	 * @private
	 */
	Promise._setImmediateFn = function _setImmediateFn(fn) {
		asap = fn;
	};

	if (typeof module !== 'undefined' && module.exports) {
		module.exports = Promise;
	} else if (!root.Promise) {
		root.Promise = Promise;
	}

})(this);

/*
 * Cookies.js - 1.2.2
 * https://github.com/ScottHamper/Cookies
 *
 * This is free and unencumbered software released into the public domain.
 */
(function (global, undefined) {
    'use strict';

    var factory = function (window) {
        if (typeof window.document !== 'object') {
            throw new Error('Cookies.js requires a `window` with a `document` object');
        }

        var Cookies = function (key, value, options) {
            return arguments.length === 1 ?
                Cookies.get(key) : Cookies.set(key, value, options);
        };

        // Allows for setter injection in unit tests
        Cookies._document = window.document;

        // Used to ensure cookie keys do not collide with
        // built-in `Object` properties
        Cookies._cacheKeyPrefix = 'cookey.'; // Hurr hurr, :)
        
        Cookies._maxExpireDate = new Date('Fri, 31 Dec 9999 23:59:59 UTC');

        Cookies.defaults = {
            path: '/',
            secure: false
        };

        Cookies.get = function (key) {
            if (Cookies._cachedDocumentCookie !== Cookies._document.cookie) {
                Cookies._renewCache();
            }
            
            var value = Cookies._cache[Cookies._cacheKeyPrefix + key];

            return value === undefined ? undefined : decodeURIComponent(value);
        };

        Cookies.set = function (key, value, options) {
            options = Cookies._getExtendedOptions(options);
            options.expires = Cookies._getExpiresDate(value === undefined ? -1 : options.expires);

            Cookies._document.cookie = Cookies._generateCookieString(key, value, options);

            return Cookies;
        };

        Cookies.expire = function (key, options) {
            return Cookies.set(key, undefined, options);
        };

        Cookies._getExtendedOptions = function (options) {
            return {
                path: options && options.path || Cookies.defaults.path,
                domain: options && options.domain || Cookies.defaults.domain,
                expires: options && options.expires || Cookies.defaults.expires,
                secure: options && options.secure !== undefined ?  options.secure : Cookies.defaults.secure
            };
        };

        Cookies._isValidDate = function (date) {
            return Object.prototype.toString.call(date) === '[object Date]' && !isNaN(date.getTime());
        };

        Cookies._getExpiresDate = function (expires, now) {
            now = now || new Date();

            if (typeof expires === 'number') {
                expires = expires === Infinity ?
                    Cookies._maxExpireDate : new Date(now.getTime() + expires * 1000);
            } else if (typeof expires === 'string') {
                expires = new Date(expires);
            }

            if (expires && !Cookies._isValidDate(expires)) {
                throw new Error('`expires` parameter cannot be converted to a valid Date instance');
            }

            return expires;
        };

        Cookies._generateCookieString = function (key, value, options) {
            key = key.replace(/[^#$&+\^`|]/g, encodeURIComponent);
            key = key.replace(/\(/g, '%28').replace(/\)/g, '%29');
            value = (value + '').replace(/[^!#$&-+\--:<-\[\]-~]/g, encodeURIComponent);
            options = options || {};

            var cookieString = key + '=' + value;
            cookieString += options.path ? ';path=' + options.path : '';
            cookieString += options.domain ? ';domain=' + options.domain : '';
            cookieString += options.expires ? ';expires=' + options.expires.toUTCString() : '';
            cookieString += options.secure ? ';secure' : '';

            return cookieString;
        };

        Cookies._getCacheFromString = function (documentCookie) {
            var cookieCache = {};
            var cookiesArray = documentCookie ? documentCookie.split('; ') : [];

            for (var i = 0; i < cookiesArray.length; i++) {
                var cookieKvp = Cookies._getKeyValuePairFromCookieString(cookiesArray[i]);

                if (cookieCache[Cookies._cacheKeyPrefix + cookieKvp.key] === undefined) {
                    cookieCache[Cookies._cacheKeyPrefix + cookieKvp.key] = cookieKvp.value;
                }
            }

            return cookieCache;
        };

        Cookies._getKeyValuePairFromCookieString = function (cookieString) {
            // "=" is a valid character in a cookie value according to RFC6265, so cannot `split('=')`
            var separatorIndex = cookieString.indexOf('=');

            // IE omits the "=" when the cookie value is an empty string
            separatorIndex = separatorIndex < 0 ? cookieString.length : separatorIndex;

            var key = cookieString.substr(0, separatorIndex);
            var decodedKey;
            try {
                decodedKey = decodeURIComponent(key);
            } catch (e) {
                if (console && typeof console.error === 'function') {
                    console.error('Could not decode cookie with key "' + key + '"', e);
                }
            }
            
            return {
                key: decodedKey,
                value: cookieString.substr(separatorIndex + 1) // Defer decoding value until accessed
            };
        };

        Cookies._renewCache = function () {
            Cookies._cache = Cookies._getCacheFromString(Cookies._document.cookie);
            Cookies._cachedDocumentCookie = Cookies._document.cookie;
        };

        Cookies._areEnabled = function () {
            var testKey = 'cookies.js';
            var areEnabled = Cookies.set(testKey, 1).get(testKey) === '1';
            Cookies.expire(testKey);
            return areEnabled;
        };

        Cookies.enabled = Cookies._areEnabled();

        return Cookies;
    };

    var cookiesExport = typeof global.document === 'object' ? factory(global) : factory;

    // AMD support
    if (typeof define === 'function' && define.amd) {
        define(function () { return cookiesExport; });
    // CommonJS/Node.js support
    } else if (typeof exports === 'object') {
        // Support Node.js specific `module.exports` (which can be a function)
        if (typeof module === 'object' && typeof module.exports === 'object') {
            exports = module.exports = cookiesExport;
        }
        // But always support CommonJS module 1.1.1 spec (`exports` cannot be a function)
        exports.Cookies = cookiesExport;
    } else {
        global.Cookies = cookiesExport;
    }
})(typeof window === 'undefined' ? this : window);

// Universal Module Definition - https://github.com/umdjs/umd/blob/master/templates/returnExports.js
/*global define, module */

(function (root, factory) {
    if (typeof define === "function" && define.amd) {
        // AMD. Register as an anonymous module.
        define([], factory);
    } else if (typeof module === "object" && module.exports) {
        // Node. Does not work with strict CommonJS, but
        // only CommonJS-like environments that support module.exports,
        // like Node.
        module.exports = factory();
    } else {
        // Browser globals (root is window)
        root.Stargate = factory();
    }
}(this, function () {
    // Public interface
    var stargatePackageVersion = "0.14.0";
    var stargatePublic = {};
    
    var stargateModules = {};       
    /* globals cordova, Promise */


/**
 * Utils module
 * @module src/modules/Utils
 * @type {Object}
 */
/* globals ActiveXObject */
(function(stargateModules){
    /**
     * @class
     * @alias module:src/modules/Utils.Logger
     * @param {String} label - OFF|DEBUG|INFO|WARN|ERROR|ALL
     * @param {String} tag - a tag to identify a log group. it will be prepended to any log function
     * @param {Object} [styles={background:"white",color:"black"}] -
     * @param {String} styles.background - background color CSS compatibile
     * @param {String} styles.color - color text CSS compatible
     * @example
     * var myLogger = new Logger("ALL", "TAG",{background:"black",color:"blue"});
     * myLogger.i("Somenthing", 1); // output will be > ["TAG"], "Somenthing", 1
     * myLogger.setLevel("off") // other values OFF|DEBUG|INFO|WARN|ERROR|ALL
     * */
    function Logger(label, tag, styles){
        this.level = Logger.levels[label.toUpperCase()];
        this.styles = styles || {background:"white",color:"black"}; //default
        this.tag = "%c " + tag + " ";
        this.isstaging = ("IS_STAGING = 1".slice(-1) === "1");

        this.styleString = "background:" + this.styles.background + ";" + "color:" + this.styles.color + ";";
        
        var argsToString = function() {
            if (arguments.length < 1) {
                return "";
            }
            var args = Array.prototype.slice.call(arguments[0]);
            var result = '';
            for (var i=0; i<args.length; i++) {
                if (typeof (args[i]) === 'object') {
                    result += " " + JSON.stringify(args[i]);
                }
                else {
                    result += " " + args[i];
                }
            }
            return result;
        };
        
        var consoleLog = window.console.log.bind(window.console, this.tag, this.styleString);
        var consoleInfo = window.console.info.bind(window.console, this.tag, this.styleString);
        var consoleError = window.console.error.bind(window.console, this.tag, this.styleString);
        var consoleWarn = window.console.warn.bind(window.console, this.tag, this.styleString);
        
        if (!this.isstaging) {
            consoleLog = function(){
                window.console.log("[D] [Stargate] "+argsToString.apply(null, arguments));
            };
            consoleInfo = function(){
                window.console.log("[I] [Stargate] "+argsToString.apply(null, arguments));
            };
            consoleError = function(){
                window.console.log("[E] [Stargate] "+argsToString.apply(null, arguments));
            };
            consoleWarn = function(){
                window.console.log("[W] [Stargate] "+argsToString.apply(null, arguments));
            };
        }
        //private and immutable
        Object.defineProperties(this, {
            "__d": {
                value: consoleLog,
                writable: false,
                enumerable:false,
                configurable:false
            },
            "__i": {
                value: consoleInfo,
                writable: false,
                enumerable:false,
                configurable:false
            },
            "__e": {
                value: consoleError,
                writable: false,
                enumerable:false,
                configurable:false
            },
            "__w": {
                value: consoleWarn,
                writable: false,
                enumerable:false,
                configurable:false
            }
        });
    }

    //Logger.prototype.group
    //OFF < DEBUG < INFO < WARN < ERROR < ALL
    // 0  < 1  < 2 < 3 < 4 < 5
    Logger.levels = {
        ALL:5,
        ERROR:4,
        WARN:3,
        INFO:2,
        DEBUG:1,
        OFF:0
    };

    /**
     * Error Logging
     * @param {*} [arguments]
     * */
    Logger.prototype.e = function(){

        if(this.level !== 0 && this.level >= Logger.levels.ERROR){
            this.__e(arguments);
        }
    };

    /**
     * Info Logging
     * @param {*} [arguments]
     * */
    Logger.prototype.i = function(){

        if(this.level !== 0 && this.level >= Logger.levels.WARN){
            this.__i(arguments);
        }
    };

    /**
     * Warn Logging
     * @param {*} [arguments]
     * */
    Logger.prototype.w = function(){
        if(this.level !== 0 && this.level >= Logger.levels.INFO){
            this.__w(arguments);
        }
    };

    /**
     * Debug Logging
     * @param {*} [arguments]
     * */
    Logger.prototype.d = function(){

        if(this.level !== 0 && this.level >= Logger.levels.DEBUG){
            this.__d(arguments);
        }
    };

    /**
     * Set the level of the logger
     * @param {String} label - OFF|DEBUG|INFO|WARN|ERROR|ALL
     * */
    Logger.prototype.setLevel = function(label){
        this.level = Logger.levels[label];
    };

    /**
     * Iterator
     *
     * @alias module:src/modules/Utils.Iterator
     * @example
     * var myArray = ["pippo", "pluto", "paperino"];
     * var it = Utils.Iterator(myArray);
     * it.next().value === "pippo"; //true
     * it.next().value === "pluto"; //true
     * it.next(true).value === "paperino" //false because with true you can reset it!
     * @param {Array} array - the array you want to transform in iterator
     * @returns {Object} - an iterator-like object
     * */
    function Iterator(array){
        var nextIndex = 0;

        return {
            next: function(reset){
                if(reset){nextIndex = 0;}
                return nextIndex < array.length ?
                {value: array[nextIndex++], done: false} :
                {done: true};
            }
        };
    }

    /**
     * A function to compose query string
     *
     * @alias module:src/modules/Utils.composeApiString
     * @example
     * var API = "http://jsonplaceholder.typicode.com/comments"
     * var url = composeApiString(API, {postId:1});
     * // url will be "http://jsonplaceholder.typicode.com/comments?postId=1"
     * @param {Strinq} api
     * @param {Object} params - a key value object: will be append to <api>?key=value&key2=value2
     * @returns {String} the string composed
     * */
    function composeApiString(api, params){
        api = api.split("?")[0].slice(0);
        api += "?";
        var qs = "";

        for(var key in params){
            qs += encodeURIComponent(key) + "=" + encodeURIComponent(params[key]) + "&";
        }

        if (qs.length > 0){
            qs = qs.substring(0, qs.length-1); //chop off last "&"
        }
        return api + qs;
    }

    /**
     * getJSON
     *
     * @alias module:src/modules/Utils.getJSON
     * @param {String} url - for example http://jsonplaceholder.typicode.com/comments?postId=1
     * @returns {Promise<Object|String>} the string error is the statuscode
     * */
    function getJSON(url){
        url = encodeURI(url);
        var xhr = typeof XMLHttpRequest != 'undefined' ? new XMLHttpRequest() : new ActiveXObject('Microsoft.XMLHTTP');

        var responseTypeAware = 'responseType' in xhr;

        xhr.open("GET", url, true);
        if (responseTypeAware) {
            xhr.responseType = 'json';
        }

        var daRequest = new Promise(function(resolve, reject){
            xhr.onreadystatechange = function(){
                if (xhr.readyState === 4) {
                    try{
                        var result = responseTypeAware ? xhr.response : JSON.parse(xhr.responseText);
                        resolve(result);
                    }catch(e){
                        reject(e);
                    }
                }
            };
        });

        xhr.setRequestHeader('Content-type', 'application/json; charset=UTF-8');
        xhr.send();
        return daRequest;
    }

    /**
     * Make a jsonp request, remember only GET
     * The function create a tag script and append a callback param in querystring.
     * The promise will be reject after 3s if the url fail to respond
     *
     * @class
     * @alias module:src/modules/Utils.jsonpRequest
     * @example
     * request = new jsonpRequest("http://www.someapi.com/asd?somequery=1");
     * request.then(...)
     * @param {String} url - the url with querystring but without &callback at the end or &function
     * @returns {Promise<Object|String>}
     * */
    function jsonpRequest(url){
        var self = this;
        self.timeout = 3000;
        self.called = false;
        if(window.document) {
            var ts = Date.now();
            self.scriptTag = window.document.createElement("script");
            url += "&callback=window.__jsonpHandler_" + ts;
            self.scriptTag.src = url;
            self.scriptTag.type = 'text/javascript';
            self.scriptTag.async = true;

            self.prom = new Promise(function(resolve, reject){
                var functionName = "__jsonpHandler_" + ts;
                window[functionName] = function(data){
                    self.called = true;
                    resolve(data);
                    self.scriptTag.parentElement.removeChild(self.scriptTag);
                    delete window[functionName];
                };
                //reject after a timeout
                setTimeout(function(){
                    if(!self.called){
                        reject("Timeout jsonp request " + ts);
                        self.scriptTag.parentElement.removeChild(self.scriptTag);
                        delete window[functionName];
                    }
                }, self.timeout);
            });
            // the append start the call
            window.document.getElementsByTagName("head")[0].appendChild(self.scriptTag);
            //return self.daPromise;
        }
    }

    /**
     * getImageRaw from a specific url
     *
     * @alias module:src/modules/Utils.getImageRaw
     * @param {Object} options - the options object
     * @param {String} options.url - http or whatever
     * @param {String} [options.responseType="blob"] - possible values arraybuffer|blob
     * @param {String} [options.mimeType="image/jpeg"] - possible values "image/png"|"image/jpeg" used only if "blob" is set as responseType
     * @param {Boolean} options.withCredentials - set with credentials before send
     * @param {Function} [_onProgress=function(){}]
     * @returns {Promise<Blob|ArrayBuffer|Error>}
     */
    function getImageRaw(options, _onProgress){
        var onProgress = _onProgress || function(){};
        return new Promise(function(resolve, reject){
            var request = new XMLHttpRequest();
            request.open ("GET", options.url, true);
            request.responseType = options.responseType || "blob";
            
            if(options.withCredentials){
               request.withCredentials = options.withCredentials; 
            }
                        
            function transferComplete(){
                var result;
                switch(options.responseType){
                    case "blob":
                        result = new Blob([this.response], {type: options.mimeType || "image/jpeg"});
                        break;
                    case "arraybuffer":
                        result = this.response;
                        break;
                    default:
                        result = this.response;
                        resolve(result);
                        break;

                }
            }

            var transferCanceled = reject;
            var transferFailed = reject;

            request.addEventListener("progress", onProgress, false);
            request.addEventListener("load", transferComplete, false);
            request.addEventListener("error", transferFailed, false);
            request.addEventListener("abort", transferCanceled, false);

            request.send(null);
        });

    }

    /**
     * extend: this function merge two objects in a new one with the properties of both
     *
     * @param {Object} o1 -
     * @param {Object} o2 -
     * @returns {Object} a brand new object results of the merging
     * */
    function extend(o1, o2){

        var isObject = Object.prototype.toString.apply({});
        if((o1.toString() !== isObject) || (o2.toString() !== isObject)) {
            throw new Error("Cannot merge different type");
        }
        var newObject = {};
        for (var k in o1){
            if(o1.hasOwnProperty(k)){
                newObject[k] = o1[k];
            }
        }

        for (var j in o2) {
            if(o2.hasOwnProperty(k)){
                newObject[j] = o2[j];
            }
        }
        return newObject;
    }

    /**
     * get the object type. date for date, array for array ecc
     * 
     * @param {*} obj - any type of object
     * @returns {String} - the type of the obj. date for example or array etc
     */
    function getType(obj){
        return ({}).toString.call(obj).match(/\s([a-z|A-Z]+)/)[1].toLowerCase();
    }

    /**
     * A function to dequerify query string
     *
     * @alias module:src/modules/Utils.dequerify
     * @example
     * var url = "http://jsonplaceholder.typicode.com/comments?postId=1
     * var obj = dequerify(url); //obj is {"postId":"1"} 
     * @param {Strinq} param 
     * @returns {Object} the object with key-value pairs
     * */
    function dequerify(param){
        param = param.slice(0);
        param = decodeURIComponent(param);
        
        var query = param.split("?")[1];
        if(!query){return {};}
        
        var keyvalue = query.split("&");
        
        return keyvalue.reduce(function(newObj, keyvalue){
            var splitted = keyvalue.split("=");
            var key = splitted[0];
            var value = splitted[1];
            newObj[key] = value;
            return newObj;        
        }, {});
    }

    var exp = {
        Iterator:Iterator,
        Logger:Logger,
        composeApiString:composeApiString,
        getJSON:getJSON,
        jsonpRequest:jsonpRequest,
        getImageRaw:getImageRaw,
        extend:extend,
        getType:getType,
        dequerify:dequerify
    };

    if(stargateModules){
        stargateModules.Utils = exp;
    }else{
        window.Utils = exp;
    }

})(stargateModules);
/**
 * File module
 * @module src/modules/File
 * @type {Object}
 * @see https://github.com/apache/cordova-plugin-file
 * @requires ./Utils.js
 */
(function(_modules, Utils){

    var File = {};
    var LOG = new Utils.Logger("ALL", "[File - module]");
    File.LOG = LOG;
    window.requestFileSystem  = window.requestFileSystem || window.webkitRequestFileSystem;
    /**
     * ERROR_MAP
     * Stargate.file.ERROR_MAP
     * */
    File.ERROR_MAP = {
        1:"NOT_FOUND_ERR",
        2:"SECURITY_ERR",
        3:"ABORT_ERR",
        4:"NOT_READABLE_ERR",
        5:"ENCODING_ERR",
        6:"NO_MODIFICATION_ALLOWED_ERR",
        7:"INVALID_STATE_ERR",
        8:"SYNTAX_ERR",
        9:"INVALID_MODIFICATION_ERR",
        10:"QUOTA_EXCEEDED_ERR",
        11:"TYPE_MISMATCH_ERR",
        12:"PATH_EXISTS_ERR"
    };

    File.currentFileTransfer = null;

    /**
     * File.resolveFS
     *
     * @param {String} url - the path to load see cordova.file.*
     * @returns {Promise<Entry|FileError>}
     * */
    File.resolveFS = function(url){
        return new Promise(function(resolve, reject){
            window.resolveLocalFileSystemURL(url, resolve, reject);
        });
    };

    /**
     * File.appendToFile
     *
     * @param {String} filePath - the filepath file:// url like
     * @param {String|Blob} data - the string to write into the file
     * @param {String} [overwrite=false] - overwrite
     * @param {String} mimeType: text/plain | image/jpeg | image/png
     * @returns {Promise<String|FileError>} where string is a filepath
     */
    File.appendToFile = function(filePath, data, overwrite, mimeType){
        //Default
        overwrite = arguments[2] === undefined ? false : arguments[2];
        mimeType = arguments[3] === undefined ? "text/plain" : arguments[3];
        return File.resolveFS(filePath)
            .then(function(fileEntry){

                return new Promise(function(resolve, reject){
                    fileEntry.createWriter(function(fileWriter) {
                        if(!overwrite){
                            fileWriter.seek(fileWriter.length);
                        }

                        var blob;
                        if(!(data instanceof Blob)){
                            blob = new Blob([data], {type:mimeType});
                        }else{
                            blob = data;
                        }

                        fileWriter.write(blob);
                        fileWriter.onerror = reject;
                        fileWriter.onabort = reject;
                        fileWriter.onwriteend = function(){
                            resolve(__transform([fileEntry]));
                        };
                    }, reject);
                });

            });
    };

    /**
     * File.readFileAsHTML
     * @param {String} indexPath - the path to the file to read
     * @returns {Promise<Document|FileError>}
     */
    File.readFileAsHTML = function(indexPath){

        return File.readFile(indexPath)
            .then(function(documentAsString){
                return new window.DOMParser().parseFromString(documentAsString, "text/html");
            });
    };

    /**
     * File.readFileAsJSON
     * @param {String} indexPath - the path to the file to read
     * @returns {Promise<Object|FileError>}
     */
    File.readFileAsJSON = function(indexPath){
        return File.readFile(indexPath)
            .then(function(documentAsString){
                try{
                    return Promise.resolve(window.JSON.parse(documentAsString));
                }catch(e){
                    return Promise.reject(e);
                }
            });
    };

    /**
     *  File.removeFile
     *
     *  @param {String} filePath - file://
     *  @returns {Promise<String|FileError>}
     * */
    File.removeFile = function(filePath){
        return File.resolveFS(filePath)
            .then(function(fileEntry){
                return new Promise(function(resolve,reject){
                    fileEntry.remove(function(result){
                        resolve(result === null || result === "OK");
                    }, reject);
                });
            });
    };

    /**
     *  File.removeDir
     *
     *  @param {String} dirpath - the directory entry to remove recursively
     *  @returns Promise<void|FileError>
     * */
    File.removeDir = function(dirpath){
        return File.resolveFS(dirpath)
            .then(function(dirEntry){
                return new Promise(function(resolve, reject){
                    dirEntry.removeRecursively(function(result){
                        resolve(result === null || result === "OK");
                    }, reject);
                });
            });
    };

    /**
     *  File._promiseZip
     *
     *  @private
     *  @param {String} zipPath - the file to unpack
     *  @param {String} outFolder - the folder where to unpack
     *  @param {Function} _onProgress - the callback called with the percentage of unzip progress
     *  @returns Promise<boolean>
     * */
    File._promiseZip = function(zipPath, outFolder, _onProgress){

        LOG.d("PROMISEZIP:", arguments);
        return new Promise(function(resolve,reject){
            window.zip.unzip(zipPath, outFolder, function(result){
                if(result === 0){
                    resolve(true);
                }else{
                    reject(result);
                }
            }, _onProgress);
        });
    };

    /**
     * File.download
     *
     * @param {String} url - the URL of the resource to download
     * @param {String} filepath - a directory entry type object where to save the file
     * @param {String} saveAsName - the name with the resource will be saved
     * @param {Function} _onProgress - a progress callback function filled with the percentage from 0 to 100
     * @returns {Promise}
     * */
    File.download = function(url, filepath, saveAsName, _onProgress){
        var self = this;
        this.ft = new window.FileTransfer();
        this.ft.onprogress = _onProgress;
        File.currentFileTransfer = self.ft;

        self.promise = new Promise(function(resolve, reject){
            self.ft.download(window.encodeURI(url), filepath + saveAsName,
                function(entry){
                    resolve(__transform([entry]));
                    self.ft = null;
                },
                function(reason){
                    reject(reason);
                    self.ft = null;
                },
                true //trustAllHosts
            );
        });
    };

    /**
     * File.createDir
     *
     * @param {String} dirPath - a file:// like path
     * @param {String} subFolderName
     * @returns {Promise<String|FileError>} - return the filepath created
     * */
    File.createDir = function(dirPath, subFolderName){
        return File.resolveFS(dirPath)
            .then(function(dirEntry){
                return new Promise(function(resolve, reject){
                    dirEntry.getDirectory(subFolderName, {create:true}, function(entry){
                        resolve(__transform([entry]));
                    }, reject);
                });
            });
    };

    /**
     *  File.fileExists
     *
     *  @param {String} url - the toURL path to check
     *  @returns {Promise<boolean|void>}
     * */
    File.fileExists = function(url){
        return new Promise(function(resolve){
            window.resolveLocalFileSystemURL(url, function(entry){

                resolve(entry.isFile);

            }, function(fileError){
                resolve(fileError.code !== 1);
            });
        });
    };

    /**
     *  File.dirExists
     *
     *  @param {String} url - the toURL path to check
     *  @returns {Promise<boolean|void>}
     * */
    File.dirExists = function(url){
        return new Promise(function(resolve){
            window.resolveLocalFileSystemURL(url, function(entry){

                resolve(entry.isDirectory);

            }, function(fileError){

                resolve(fileError.code != 1);
            });
        });
    };

    /**
     * File.requestFileSystem
     *
     * @param {int} TYPE - 0 == window.LocalFileSystem.TEMPORARY or 1 == window.LocalFileSystem.PERSISTENT
     * @param {int} size - The size in bytes for example 5*1024*1024 == 5MB
     * @returns {Promise}
     * */
    File.requestFileSystem = function(TYPE, size) {
        return new Promise(function (resolve, reject) {
            window.requestFileSystem(TYPE, size, resolve, reject);
        });
    };

    /**
     * File.readDir
     *
     * @param {String} dirPath - a directory path to read
     * @returns {Promise<Array>} - returns an array of Object files
     * */
    File.readDir = function(dirPath){
        return File.resolveFS(dirPath)
            .then(function(dirEntry){
                return new Promise(function(resolve, reject){
                    var reader = dirEntry.createReader();
                    reader.readEntries(function(entries){
                        LOG.d("readDir:",entries);
                        resolve(__transform(entries));
                    }, reject);
                });
            });
    };

    /**
     * File.readFile
     *
     * @param {String} filePath - the file entry to readAsText
     * @returns {Promise<String|FileError>}
     */
    File.readFile = function(filePath) {

        return File.resolveFS(filePath)
            .then(function(fileEntry){
                return new Promise(function(resolve, reject){
                    fileEntry.file(function(file) {
                        var reader = new FileReader();
                        reader.onerror = reject;
                        reader.onabort = reject;

                        reader.onloadend = function() {
                            var textToParse = this.result;
                            resolve(textToParse);
                        };
                        reader.readAsText(file);
                        //readAsDataURL
                        //readAsBinaryString
                        //readAsArrayBuffer
                    });
                });
            });
    };

    /**
     * File.createFile
     *
     * @param {String} directory - filepath file:// like string
     * @param {String} filename - the filename including the .txt
     * @returns {Promise<FileEntry|FileError>}
     * */
    File.createFile = function(directory, filename){
        return File.resolveFS(directory)
            .then(function(dirEntry){
                return new Promise(function(resolve, reject){
                    dirEntry.getFile(filename, {create:true}, function(entry){
                        resolve(__transform([entry]));
                    }, reject);
                });
            });
    };

    /**
     * write a file in the specified path and if not exists creates it
     *
     * @param {String} filepath - file:// path-like
     * @param {String|Blob} content
     * @returns {Promise<Object|FileError>}
     * */
    File.write = function(filepath, content){
        return File.fileExists(filepath).then(function(exists){
            if(!exists){
                var splitted = filepath.split('/');
                
                // this returns a new array and rejoin the path with /
                var folder = splitted.slice(0, splitted.length - 1).join('/');
                var filename = splitted[splitted.length - 1];

                return File.createFile(folder, filename).then(function(entry){
                    return File.appendToFile(entry.path, content, true);                 
                });
            }
            return File.appendToFile(filepath, content, true);
        });
    };

    /**
     * moveDir
     *
     * @param {String} source
     * @param {String} destination
     * @returns {Promise<FileEntry|FileError>}
     * */
    File.moveDir = function(source, destination){
        var newFolderName = destination.substring(destination.lastIndexOf('/')+1);
        var parent = destination.replace(newFolderName, "");
        
        LOG.d("moveDir:", parent, newFolderName);
        return Promise.all([File.resolveFS(source), File.resolveFS(parent)])
            .then(function(entries){
                LOG.d("moveDir: resolved entries", entries);
                return new Promise(function(resolve, reject){
                    entries[0].moveTo(entries[1], newFolderName, resolve, reject);
                });
            });
    };

    /**
     * copyFile
     * @param {String} source
     * @param {String} destination
     * @returns {Promise<FileEntry|FileError>}
     * */
    File.copyFile = function(source, destination){
        var newFilename = destination.substring(destination.lastIndexOf('/')+1);
        var parent = destination.replace(newFilename, "");

        return Promise.all([File.resolveFS(source), File.resolveFS(parent)])
            .then(function(entries){
                //TODO: check if are really files
                LOG.d("copyFileTo", entries);
                return new Promise(function(resolve, reject){
                    entries[0].copyTo(entries[1], newFilename, resolve, reject);
                });
            });
    };

    /**
     * copyDir
     * @param {String} source
     * @param {String} destination
     * @returns {Promise<FileEntry|FileError>}
     * */
    File.copyDir = function(source, destination){
        var newFolderName = destination.substring(destination.lastIndexOf('/')+1);
        var parent = destination.replace(newFolderName, "");

        return Promise.all([File.resolveFS(source), File.resolveFS(parent)])
            .then(function(entries){
                LOG.d("copyDir", source, "in",destination);
                return new Promise(function(resolve, reject){
                    entries[0].copyTo(entries[1], newFolderName, resolve, reject);
                });
            });
    };

    /**
     * getMetadata from FileEntry or DirectoryEntry
     * @param path {String} - the path string
     * @returns {Promise<Object|FileError>}
     */
    File.getMetadata = function(path){
        return File.resolveFS(path)
                   .then(function(entry){
                       return new Promise(function(resolve,reject){
                            entry.getMetadata(resolve,reject);
                       });                        
                   });
    };

    /**
     * __transform utils function
     * @private
     * @param {Array} entries - an array of Entry type object
     * @returns {Array.<Object>} - an array of Object
     * */
    function __transform(entries){
        var arr = entries.map(function(entry){
            return {
                fullPath:entry.fullPath,
                path:entry.toURL(),
                internalURL:entry.toInternalURL(),
                isFile:entry.isFile,
                isDirectory:entry.isDirectory
            };
        });
        return (arr.length == 1) ? arr[0] : arr;
    }

    if(_modules){
        _modules.file = File;
    }else{
        window.file = File;
    }

})(stargateModules, stargateModules.Utils);
/**globals Promise, cordova **/
/**
 * Game module needs cordova-plugin-file cordova-plugin-file-transfer
 * @module src/modules/Game
 * @type {Object}
 * @requires ./Utils.js,./File.js
 */
(function(fileModule, Utils, _modules){
    "use strict";

    var Logger = Utils.Logger,
        querify = Utils.composeApiString,
        //Iterator = Utils.Iterator,
        //getJSON = Utils.getJSON,
        jsonpRequest = Utils.jsonpRequest,
        extend = Utils.extend;    
    
    var baseDir,
        cacheDir,
        tempDirectory,
        constants = {},
        wwwDir,
        dataDir,
        stargatejsDir,
        CONF = {
            sdk_url:"",
            dixie_url:"",
            api:"",
            ga_for_game_url:"",
            gamifive_info_api:"",
            bundle_games:[]
        },
        downloading = false;

    var emptyOfflineData = {
        GaForGame: {},
        GamifiveInfo: {},
        queues: {}
    };

    var obj = {
        "content_id":"", // to fill
        "formats":"html5applications",
        "sort":"-born_date",
        "category":"b940b384ff0565b06dde433e05dc3c93",
        "publisher":"",
        "size":6,
        "offset":0,
        "label":"",
        "label_slug":"",
        "access_type":"",
        "real_customer_id":"xx_gameasy",
        "lang":"en",
        "use_cs_id":"",
        "white_label":"xx_gameasy",
        "main_domain":"http://www2.gameasy.com/ww",
        "fw":"gameasy",
        "vh":"ww.gameasy.com",
        "check_compatibility_header":0
    };

    var LOG = new Logger("ALL", "[Game - module]", {background:"black",color:"#5aa73a"});

    /**
     * @constructor
     * @alias module:src/modules/Game
     * @example
     *
     * var sgConf = modules: ["game"],
     *     modules_conf: {
     *           "game": {
     *               "bundle_games": [
     *                   "<content_id>",
     *                   "<content_id>"
     *               ]
     *           }
     *       };
     *
     * var afterSgInit = Stargate.initialize(sgConf);
     * afterSgInit
     * .then(function(){
     *      return Stargate.game.download(gameObject, {onStart:function(ev){}, onEnd:function(ev){}, onProgress:function(ev){}})
     * })
     * .then(function(gameID){
     *      Stargate.game.play(gameID);
     * });
     * */
     function Game(){}

    /**
     * Init must be called after the 'deviceready' event
     *
     * @param {Object} customConf - the configuration
     * @param {String} customConf.sdk_url
     * @param {String} customConf.dixie_url
     * @param {String} customConf.api
     * @param {String} customConf.ga_for_game_url
     * @param {String} customConf.gamifive_info_api
     * @param {Array} customConf.bundle_games
     * @returns {Promise<Array<boolean>>}
     * */
     function initialize(customConf){

        if(customConf){
            CONF = extend(CONF, customConf);
        }
        LOG.d("Initialized called with:", CONF);

        if(!fileModule){return Promise.reject("Missing file module!");}

        try{
            baseDir = window.cordova.file.applicationStorageDirectory;
            cacheDir = window.cordova.file.cacheDirectory;
            tempDirectory = window.cordova.file.tempDirectory;
            wwwDir = window.cordova.file.applicationDirectory + "www/";
            stargatejsDir = window.cordova.file.applicationDirectory + "www/js/stargate.js";
            dataDir = window.cordova.file.dataDirectory;
        }catch(reason){
            LOG.e(reason);
            return Promise.reject(reason);
        }


        /**
         * Putting games under Documents r/w. ApplicationStorage is read only
         * on android ApplicationStorage is r/w
         */
        if(window.device.platform.toLowerCase() == "ios"){baseDir += "Documents/";}
        if(window.device.platform.toLowerCase() == "android"){tempDirectory = cacheDir;}

        constants.SDK_DIR = baseDir + "scripts/";
        constants.SDK_RELATIVE_DIR = "../../scripts/";
        constants.GAMEOVER_RELATIVE_DIR = "../../gameover_template/";        
        constants.GAMES_DIR = baseDir + "games/";
        constants.BASE_DIR = baseDir;
        constants.CACHE_DIR = cacheDir;
        constants.TEMP_DIR = tempDirectory;
        constants.CORDOVAJS = wwwDir + "cordova.js";
        constants.CORDOVA_PLUGINS_JS = wwwDir + "cordova_plugins.js";
        constants.STARGATEJS = wwwDir + "js/stargate.js";
        constants.DATA_DIR = dataDir;
        constants.GAMEOVER_DIR = constants.BASE_DIR + "gameover_template/";
        constants.WWW_DIR = wwwDir;

        LOG.i("cordova JS dir to include", constants.CORDOVAJS);

        /** expose */
        _modules.game._public.BASE_DIR = constants.BASE_DIR;
        _modules.game._public.OFFLINE_INDEX = constants.WWW_DIR + "index.html";


        /**
         * Create directories
         * */
        var userDataStructure = {'0000': {'0000':{ data:{}, UpdatedAt:new Date(0)} } };

        var gamesDirTask = fileModule.createDir(constants.BASE_DIR, "games");
        var scriptsDirTask = fileModule.createDir(constants.BASE_DIR, "scripts");
        var createOfflineDataTask = fileModule.fileExists(constants.BASE_DIR + "offlineData.json")
                                        .then(function(exists){
                                            if(!exists){ 
                                                return fileModule.write(constants.BASE_DIR + "offlineData.json", JSON.stringify(emptyOfflineData)); 
                                            } else { return Promise.resolve(); }
                                        });
        var createUserDataTask = fileModule.fileExists(constants.BASE_DIR + "userData.json")
                                    .then(function(exists){
                                        if(!exists){ 
                                            return fileModule.write(constants.BASE_DIR + "userData.json", JSON.stringify(userDataStructure)); 
                                        } else { return Promise.resolve(); }
                                    });
            

        return Promise.all([
                gamesDirTask,
                scriptsDirTask,
                createOfflineDataTask,
                createUserDataTask
            ])
            .then(function(results){
                LOG.d("GamesDir, ScriptsDir, offlineData.json, userData.json created", results);
                return copyAssets();
            })
            .then(getSDK)
            .then(getNewton);
    }

    function copyAssets(){
        return Promise.all([
            fileModule.dirExists(constants.BASE_DIR + "gameover_template"),
            fileModule.dirExists(constants.SDK_DIR + "plugins"),
            fileModule.fileExists(constants.SDK_DIR + "cordova.js"),
            fileModule.fileExists(constants.SDK_DIR + "cordova_plugins.js"),
            fileModule.fileExists(constants.SDK_DIR + "gamesFixes.js")
        ]).then(function(results){
            var all = [];
            if(!results[0]){
                all.push(fileModule.copyDir(constants.WWW_DIR + "gameover_template", constants.BASE_DIR + "gameover_template"));
            }

            if(!results[1]){
                all.push(fileModule.copyDir(constants.WWW_DIR + "plugins", constants.SDK_DIR + "plugins"));
            }

            if(!results[2]){
                all.push(fileModule.copyFile(constants.CORDOVAJS, constants.SDK_DIR + "cordova.js"));
            }

            if(!results[3]){
                all.push(fileModule.copyFile(constants.CORDOVA_PLUGINS_JS, constants.SDK_DIR + "cordova_plugins.js"));
            }

            if(!results[4]){
                all.push(fileModule.copyFile(constants.WWW_DIR + "js/gamesFixes.js", constants.SDK_DIR + "gamesFixes.js"));
            }
            return Promise.all(all);
        });
    }

    /**
     * it makes an HEAD request and returns the specific header as string
     * @param {String} url
     * @param {String} header - the header name: Last-Modified,ecc 
     * @returns {Promise<String>}
     */
    function getResourceHeader(url, header){
        return new Promise(function(resolve, reject){            
            var xhr = new XMLHttpRequest();
            xhr.open("HEAD", url, true);

            xhr.addEventListener("error", reject, false);
            xhr.addEventListener("abort", reject, false);
            
            xhr.addEventListener("loadend", function(){
                resolve(xhr.getResponseHeader(header));
            });
            
            xhr.send(null);
        });
    }

    function getSDK(){
        var now = new Date();
        var sdkURLFresh = querify(CONF.sdk_url, {'v': now.getTime()});
        
        if(CONF.sdk_url === "" || CONF.sdk_url === undefined || CONF.sdk_url === null){
            LOG.d('sdk_url is not a valid one');
            return Promise.resolve('sdk_url is not a valid one');
        }

        return fileModule.fileExists(constants.SDK_DIR + "gfsdk.min.js").then(function(isSdkDownloaded){
            var tasks = [];
            
            if(!isSdkDownloaded){
                LOG.d("isSdkDownloaded", isSdkDownloaded, "get SDK", sdkURLFresh);
                tasks.push(new fileModule.download(sdkURLFresh, constants.SDK_DIR, "gfsdk.min.js").promise);
            }
            
            return Promise.all(tasks);
        }).then(function getSdkMetaData(){
            // Getting file meta data
            return Promise.all([
                getResourceHeader(sdkURLFresh, 'Last-Modified'),              
                fileModule.getMetadata(constants.SDK_DIR + "gfsdk.min.js")
            ]);            
        }).then(function checkSdkDate(results){
            var localSdkMetadata = results[1],
                remoteSdkMetadata = results[0],
                tasks = [];
            
            var localSdkModification = new Date(localSdkMetadata.modificationTime);
            var remoteSdkMetadataModification = new Date(remoteSdkMetadata);            
            // localSdkModification day < remoteSdkMetadataModification then download it
            if(localSdkModification < remoteSdkMetadataModification){
                LOG.d('updating sdk', sdkURLFresh, 'localModification date:', localSdkModification, 'remoteModification date:', remoteSdkMetadataModification);
                tasks.push(new fileModule.download(sdkURLFresh, constants.SDK_DIR, "gfsdk.min.js").promise);
            }
            return Promise.all(tasks);
        });
    }

    function getNewton(){
        if(CONF.newton_url === "" || CONF.newton_url === undefined || CONF.newton_url === null){
            LOG.d('newton_url is not a valid one');
            return Promise.resolve('newton_url is not a valid one');
        }     
        return fileModule.fileExists(constants.SDK_DIR + "newton.min.js")
        .then(function(isNewtonDownloaded){            
            if(!isNewtonDownloaded){
                LOG.d("isNewtonDownloaded", isNewtonDownloaded, "get Newton", CONF.newton_url);
                return new fileModule.download(CONF.newton_url, constants.SDK_DIR, "newton.min.js").promise;
            }
            LOG.d("isNewtonDownloaded", isNewtonDownloaded);
            return isNewtonDownloaded;
        });
    }

    /**
     * download the game and unzip it
     *
     * @param {object} gameObject - The gameObject with the url of the html5game's zip
     * @param {object} [callbacks={}] - an object with start-end-progress callbacks
     * @param [callbacks.onProgress=function(){}] - a progress function filled with the percentage
     * @param [callbacks.onStart=function(){}] - called on on start
     * @param [callbacks.onEnd=function(){}] - called when unzipped is done
     * @returns {Promise<boolean|FileError|Number>} - true if all has gone good, 403 if unathorized, FileError in case can write in the folder
     * */
    Game.prototype.download = function(gameObject, callbacks){
        // Clone object for security
        var self = this;
        gameObject = JSON.parse(JSON.stringify(gameObject));
        var err;
        if(this.isDownloading()){
            err = {type:"error",description:"AlreadyDownloading"};
            callbacks.onEnd(err);
            return Promise.reject(err); 
        }
        
        if((!gameObject.hasOwnProperty("response_api_dld")) || gameObject.response_api_dld.status !== 200){
            err = {type:"error",description:"response_api_dld.status not equal 200 or undefined"};
            callbacks.onEnd(err);
            return Promise.reject(err);
        }

        var alreadyExists = this.isGameDownloaded(gameObject.id);
        // Defaults
        callbacks = callbacks ? callbacks : {};
        var _onProgress = callbacks.onProgress ? callbacks.onProgress : function(){};
        var _onStart = callbacks.onStart ? callbacks.onStart : function(){};
        var _onEnd = callbacks.onEnd ? callbacks.onEnd : function(){};

        /**
         * Decorate progress function with percentage and type operation
         */
        function wrapProgress(type){
            return function(progressEvent){
                //LOG.d(progressEvent);
                var percentage = Math.round((progressEvent.loaded / progressEvent.total) * 100);
                _onProgress({percentage:percentage,type:type});
            };
        }       
        
        var currentSize = gameObject.size.replace("KB", "").replace("MB", "").replace(",", ".").trim();
        var conversion = {KB:1, MB:2, GB:3, TB:5};
        // var isKB = gameObject.size.indexOf("KB") > -1 ? true : false;
        var isMB = gameObject.size.indexOf("MB") > -1 ? true : false;
        var bytes = currentSize * Math.pow(1024, isMB ? conversion.MB : conversion.KB);
        
        var saveAsName = gameObject.id;
        function start(){
            _onStart({type:"download"});
            var spaceEnough = fileModule.requestFileSystem(1, bytes);
            LOG.d("Get GameInfo, fly my minipony!");
            return spaceEnough
                .then(function(result){
                    LOG.i("Space is ok, can download:", bytes, result);
                    return storeOfflineData(saveAsName);
                })
                .then(function(results){
                    LOG.d("Ga for game and gamifive info stored!", results);
                    LOG.d("Start Download:", gameObject.id, gameObject.response_api_dld.binary_url);
                    return new fileModule.download(gameObject.response_api_dld.binary_url, constants.TEMP_DIR, saveAsName + ".zip", wrapProgress("download")).promise;
                })
                .then(function(entry){
                    //Unpack
                    _onStart({type:"unzip"});
                    LOG.d("unzip:", gameObject.id, constants.TEMP_DIR + saveAsName);
                    return fileModule._promiseZip(entry.path, constants.TEMP_DIR + saveAsName, wrapProgress("unzip"));
                })
                .then(function(result){
                    //Notify on end unzip
                    LOG.d("Unzip ended", result);
                    _onEnd({type:"unzip"});

                    /** check levels of folders before index **/
                    var api_dld = gameObject.response_api_dld.url_download;
                    var folders = api_dld.substring(api_dld.lastIndexOf("game"), api_dld.length).split("/");
                    
                    var slashed = api_dld.split("/");
                    var splitted = slashed.slice(slashed.lastIndexOf("game"), slashed.length);

                    folders = [];
                    for(var i = 0; i < splitted.length;i++){
                        // not game and not ends with html
                        if(splitted[i] !== "game" && !isIndexHtml(splitted[i])){
                            folders.push(splitted[i]);
                        }
                    }
                       
                    LOG.d("Folders before index", folders);
                    // prepend the gameId
                    folders.unshift(saveAsName);
                    
                    var src = constants.TEMP_DIR + folders.join("/");
                    LOG.d("Folders on disk", src);

                    LOG.d("Copy game folder in games/", src, constants.GAMES_DIR + saveAsName);                    
                    return fileModule.moveDir(src, constants.GAMES_DIR + saveAsName);                   
                })
                .then(function(result){
                    // Remove the zip in the temp directory
                    LOG.d("Remove zip from:", constants.TEMP_DIR + saveAsName + ".zip", "last operation result", result);
                    return fileModule.removeFile(constants.TEMP_DIR + saveAsName + ".zip");
                })
                .then(function(){
                    //GET COVER IMAGE FOR THE GAME!
                    LOG.d("Save meta.json for:", gameObject.id);
                    /*var info = {
                        gameId:gameObject.id,
                        size:{width:"240",height:"170",ratio:"1_4"},
                        url:gameObject.images.cover.ratio_1_4,
                        type:"cover",
                        method:"xhr" //!important!
                    };*/

                    var info = {
                        gameId:gameObject.id,
                        size:{width:"500",height:"500",ratio:"1"},
                        url:gameObject.images.cover.ratio_1,
                        type:"cover",
                        method:"xhr" //!important!
                    };

                    return downloadImage(info);

                })
                .then(function(coverResult){                    
                    LOG.d("Save meta.json for:", gameObject.id);
                    LOG.d("Download image result", coverResult);

                    /**
                     * Modify gameObject.images.cover.ratio_1_4
                     * it point to the cover image with cdvfile:// protocol
                     * TODO: Build a system for file caching also for webapp
                     * **/
                    gameObject.images.cover.ratio_1 = coverResult.internalURL;
                    return fileModule.createFile(constants.GAMES_DIR + saveAsName, "meta.json")
                        .then(function(entry){                            
                            return fileModule.write(entry.path, JSON.stringify(gameObject));
                        });
                })
                .then(function(result){
                    
                    LOG.d("result last operation:save meta.json", result);
                    LOG.d("InjectScripts in game:", gameObject.id, wwwDir);                    
                    return injectScripts(gameObject.id, [
                                constants.SDK_RELATIVE_DIR + "gamesFixes.js",
                                constants.GAMEOVER_RELATIVE_DIR + "gameover.css",
                                constants.SDK_RELATIVE_DIR + "cordova.js",
                                constants.SDK_RELATIVE_DIR + "cordova_plugins.js",
                                constants.SDK_RELATIVE_DIR + "newton.min.js",
                                constants.SDK_RELATIVE_DIR + "gfsdk.min.js"
                            ]);
                }).then(function(results){
                    LOG.d("injectScripts result", results);
                    _onEnd({type:"download"});
                    downloading = false;
                    return gameObject.id;
                }).catch(function(reason){
                    LOG.e(reason, "Cleaning...game not downloaded", gameObject.id);
                    downloading = false;
                    self.remove(gameObject.id);
                    _onEnd({type:"error",description:reason});
                    throw reason;
                });
        }

        return alreadyExists.then(function(exists){
            LOG.d("Exists", exists);
            if(exists){
                downloading = false;
                return Promise.reject({12:"AlreadyExists",gameID:gameObject.id});
            }else{
                downloading = true;
                return start();
            }
        });

    };
    
    /**
     * play
     *
     * @param {String} gameID - the game path in gamesDir where to look for. Note:the game is launched in the same webview
     * @returns {Promise}
     * */
    Game.prototype.play = function(gameID){
        LOG.d("Play", gameID);
        /*
        * TODO: check if games built with Construct2 has orientation issue
        * attach this to orientationchange in the game index.html
        * if(cr._sizeCanvas) window.cr_sizeCanvas(window.innerWidth, window.innerHeight)
        */
        var gamedir = constants.GAMES_DIR + gameID;
        return fileModule.readDir(gamedir)
            .then(function(entries){
                //Search for an /index.html?$/
                return entries.filter(function(entry){                    
                    return isIndexHtml(entry.path);
                });
            })
            .then(function(entries){
                openInWebview(entries[0], false);
            });
    };

    /**
     * Open the game in a second webview if it's supported
     * @param
     * @param
     */
    function openInWebview(entry, loading){
        LOG.d("Playing this", entry);
        var secondWebViewSupport = window.webview ? true : false;
        var address = entry.internalURL + "?hybrid=1";
        if(window.device.platform.toLowerCase() === "ios"){                
            if(secondWebViewSupport){
                LOG.d("Play ios in other webview", entry.path);            
                window.webview.Show(entry.path, console.log.bind(console), console.warn.bind(console), loading);
            } else {
                LOG.d("Play ios in the same webview", entry);
                window.location.replace(address);
            }
        } else {        
            if(secondWebViewSupport){
                LOG.d("Play android second webview", entry.path);
                window.webview.Show(address, console.log.bind(console), console.warn.bind(console), loading);
            } else {
                LOG.d("Play android same webview", entry.path);
                window.navigator.app.loadUrl(encodeURI(address));
            }
        }
    }

    /**
     * Returns an Array of entries that match /index\.html$/i should be only one in the game directory
     * @private
     * @param {String} gameID
     * @returns {Promise<Array|FileError>}
     * */
    function _getIndexHtmlById(gameID){
        LOG.d("_getIndexHtmlById", constants.GAMES_DIR + gameID);
        return fileModule.readDir(constants.GAMES_DIR + gameID)
            .then(function(entries){
                LOG.d("_getIndexHtmlById readDir", entries);
                return entries.filter(function(entry){                    
                    return isIndexHtml(entry.path);
                });
            });            
    }

    /**
     * removeRemoteSDK from game's dom
     *
     * @private
     * @param {Document} dom - the document object
     * @returns {Document} the cleaned document element
     * */
    function _removeRemoteSDK(dom){
        LOG.d("_removeRemoteSDK");
        var scripts = dom.querySelectorAll("script");
        var scriptTagSdk;
        for(var i = 0;i < scripts.length;i++){
            if(scripts[i].src.indexOf("gfsdk") !== -1){
                scriptTagSdk = scripts[i];
                LOG.d("_removeRemoteSDK", scriptTagSdk);
                scriptTagSdk.parentNode.removeChild(scriptTagSdk);
                break;
            }
        }
        return dom;
    }

    /**
     * _injectScriptsInDom
     *
     * @private
     * @param {Document} dom - the document where to inject scripts
     * @param {Array|String} sources - the src tag string or array of strings
     * */
    function _injectScriptsInDom(dom, sources){
        dom = _removeRemoteSDK(dom);
        var _sources = Array.isArray(sources) === false ? [sources] : sources;
        var temp, css;
        LOG.d("injectScripts", _sources);
        // Allow scripts to load from local cdvfile protocol
        // default-src * data: cdvfile://* content://* file:///*;
        var metaTag = document.createElement("meta");
        metaTag.httpEquiv = "Content-Security-Policy";
        metaTag.content = "default-src * " +
            "data: " +
            "content: " +
            "cdvfile: " +
            "file: " +
            "http: " +
            "https: " +
            "gap: " +
            "blob: " +
            "https://ssl.gstatic.com " +
            "'unsafe-inline' " +
            "'unsafe-eval';" +
            "style-src * cdvfile: http: https: 'unsafe-inline';";
        dom.head.insertBefore(metaTag, dom.getElementsByTagName("meta")[0]);

        /**
         *  Create a script element __root__
         *  in case none script in head is present
         * */
        var root = dom.createElement("script");
        root.id = "__root__";
        dom.head.insertBefore(root, dom.head.firstElementChild);

        var scriptFragment = dom.createDocumentFragment();

        for(var i = 0;i < _sources.length;i++){
            if(_sources[i].endsWith(".css")){
                LOG.d("css inject:",_sources[i]);
                css = dom.createElement("link");
                css.rel = "stylesheet";
                css.href = _sources[i];
                dom.head.insertBefore(css, dom.getElementsByTagName("link")[0]);
            }else{
                temp = dom.createElement("script");
                temp.src = _sources[i];
                scriptFragment.appendChild(temp);
                // insertAfter(temp, root);
            }
        }

        dom.head.insertBefore(scriptFragment, dom.head.getElementsByTagName("script")[0]);
        LOG.d("Cleaned dom:",dom);
        return dom;
    }

    function removeOldGmenu(dom){
        var toRemove = [];
        toRemove.push(dom.querySelector("link[href='/gmenu/frame.css']"));
        toRemove.push(dom.querySelector("iframe#menu"));
        toRemove.push(dom.querySelector("script[src='/gmenu/toggle.js']"));
        var scripts = dom.querySelectorAll("script");

        for(var i = scripts.length - 1;i >= 0; i--){
            if(scripts[i].innerHTML.indexOf("function open") !== -1){
                toRemove.push(scripts[i]);
                //scripts[i].parentNode.removeChild(scripts[i]);
                break;
            }
        }

        for(var j = 0; j < toRemove.length;j++){
            if(toRemove[j]){
                toRemove[j].parentNode.removeChild(toRemove[j]);
            }
        }

        return dom;
    }

    /**
     * injectScripts in game index
     *
     * @private
     * @param {String} gameID
     * @param {Array} sources - array of src'string
     * @returns {Promise<Object|FileError>}
     * */
    function injectScripts(gameID, sources){
        var indexPath;
        return _getIndexHtmlById(gameID)
            .then(function(entry){
                indexPath = entry[0].path;
                LOG.d("injectScripts", indexPath);
                return fileModule.readFileAsHTML(entry[0].path);
            })
            .then(function(dom){
                function appendToHead(element){ dom.head.appendChild(element);}

                /** FIX the viewport in any case */
                var metaViewport = dom.querySelector('meta[name=viewport]');
                if(metaViewport) { metaViewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no, minimal-ui'; }
                var metaTags = dom.body.querySelectorAll("meta");
                var linkTags = dom.body.querySelectorAll("link");
                var styleTags = dom.body.querySelectorAll("style");
                var titleTag = dom.body.querySelectorAll("title");

                metaTags = [].slice.call(metaTags);
                linkTags = [].slice.call(linkTags);
                styleTags = [].slice.call(styleTags);
                titleTag = [].slice.call(titleTag);

                var all = metaTags
                    .concat(linkTags)
                    .concat(styleTags)
                    .concat(titleTag);

                all.map(appendToHead);
                dom.body.innerHTML = dom.body.innerHTML.trim();

                LOG.d("_injectScripts");
                LOG.d(dom);
                return _injectScriptsInDom(dom, sources);
            })
            .then(removeOldGmenu)
            .then(function(dom){
                var attrs = [].slice.call(dom.querySelector("html").attributes);
                var htmlAttributesAsString = attrs.map(function(item){
                    return item.name + '=' + '"' + item.value+'"';
                }).join(" ");

                var finalDocAsString = "<!DOCTYPE html><html " + htmlAttributesAsString + ">" + dom.documentElement.innerHTML + "</html>";
                LOG.d("Serialized dom", finalDocAsString);
                return finalDocAsString;
            })
            .then(function(htmlAsString){
                LOG.d("Write dom:", indexPath, htmlAsString);
                return fileModule.write(indexPath, htmlAsString);
            });
    }

    function isIndexHtml(theString){
        var isIndex = new RegExp(/.*\.html?$/i);
        return isIndex.test(theString);
    }

    /**
     * remove the game directory
     *
     * @public
     * @param {String} gameID - the game id to delete on filesystem
     * @returns {Promise<Array>}
     * */
    Game.prototype.remove = function(gameID){
        LOG.d("Removing game", gameID);
        var isCached = fileModule.dirExists(constants.CACHE_DIR + gameID + ".zip");
        var isInGameDir = fileModule.dirExists(constants.GAMES_DIR + gameID);
        return Promise.all([isCached, isInGameDir])
            .then(function(results){
                var finalResults = [];
                if(results[0]){
                    LOG.d("Removed in cache", results[0]);
                    finalResults.push(fileModule.removeFile(constants.CACHE_DIR + gameID + ".zip"));
                }

                if(results[1]){
                    LOG.d("Removed", results[1]);
                    finalResults.push(fileModule.removeDir(constants.GAMES_DIR + gameID));
                }

                if(finalResults.length === 0){
                    LOG.i("Nothing to remove", finalResults);
                }
                return finalResults;
            });
    };

    /**
     * isDownloading
     *
     * @public
     * @returns {boolean}
     * */
    Game.prototype.isDownloading = function(){
        return downloading;
    };

    /**
     * abortDownload
     *
     * @public
     * @returns {boolean}
     * */
    Game.prototype.abortDownload = function(){
        if(this.isDownloading()){
            LOG.d("Abort last download");
            if(fileModule.currentFileTransfer){
                fileModule.currentFileTransfer.abort();
                fileModule.currentFileTransfer = null;
                downloading = false;
            }

            return true;
        }
        LOG.w("There's not a download operation to abort");
        return false;
    };

    /**
     * list
     *
     * @public
     * @returns {Promise<Array>} - Returns an array of metainfo gameObject
     * */
    Game.prototype.list = function(){
        LOG.d("Get games list");
        return fileModule.readDir(constants.GAMES_DIR)
            .then(function(entries){
                var _entries = Array.isArray(entries) ? entries : [entries];
                return _entries.filter(function(entry){
                    //get the <id> folder. Careful: there's / at the end
                    if(entry.isDirectory){
                        return entry;
                    }
                });
            }).then(function(gameEntries){
                var metajsons = gameEntries.map(function(gameEntry){
                    return fileModule.readFileAsJSON(gameEntry.path + "meta.json");
                });

                return Promise.all(metajsons).then(function(results){
                    return results;
                });
            });
    };
    
    /**
     * buildGameOver
     * 
     * @param {Object} datas - the data score, start, duration
     * @param datas.score
     * @param datas.start
     * @param datas.duration
     * @param datas.content_id
     * @returns {Promise<String>} - The promise will be filled with the gameover html {String}     
     */
    Game.prototype.buildGameOver = function(datas){                 
        var metaJsonPath = constants.GAMES_DIR + datas.content_id + "/meta.json";
        /** Check if content_id is here */
        if(!datas.hasOwnProperty("content_id")){ return Promise.reject("Missing content_id key!");}
        
        LOG.d("Read meta.json:", metaJsonPath);
        LOG.d("GAMEOVER_TEMPLATE path", constants.GAMEOVER_DIR + "gameover.html");
        /***
         * if needed
         * return new window.DOMParser().parseFromString(documentAsString, "text/xml").firstChild
         * **/
        return Promise.all([
            fileModule.readFileAsJSON(metaJsonPath),
            fileModule.readFile(constants.GAMEOVER_DIR + "gameover.html")
        ]).then(function(results){
                var htmlString = results[1];
                var metaJson = results[0];
                LOG.i("Meta JSON:", metaJson);
                return htmlString
                    .replace("{{score}}", datas.score)
                    .replace("{{game_title}}", metaJson.title)
                    .replace("{{game_title}}", metaJson.title)
                    .replace("{{url_share}}", metaJson.url_share)
                    .replace("{{url_cover}}", metaJson.images.cover.ratio_1);
                    //.replace("{{startpage_url}}", constants.WWW_DIR + "index.html");
        });
    };

    /**
     * isGameDownloaded
     *
     * @param {String} gameID - the id of the game
     * @returns {Promise}
     * */
    Game.prototype.isGameDownloaded = function(gameID){
        return fileModule.dirExists(constants.GAMES_DIR + gameID);
    };

    /**
     * removeAll delete all games and recreate the games folder
     *
     * @returns {Promise}
     * */
    Game.prototype.removeAll = function(){
        return fileModule.removeDir(constants.GAMES_DIR)
            .then(function(result){
                LOG.d("All games deleted!", result);
                return fileModule.createDir(constants.BASE_DIR, "games");
            });
    };

    /**
     * downloadImage
     * Save the image in games/<gameId>/images/<type>/<size.width>x<size.height>.png
     *
     * @param {String} info -
     * @param {String} info.gameId -
     * @param {Object} info.size -
     * @param {String|Number} info.size.width -
     * @param {String|Number} info.size.height -
     * @param {String|Number} info.size.ratio - 1|2|1_5|1_4
     * @param {String} info.url - the url with the [HSIZE] and [WSIZE] in it
     * @param {String} info.type - possible values cover|screenshot|icon
     * @param {String} info.method - possible values "xhr"
     * @returns {Promise<String|FileTransferError>} where string is the cdvfile:// path
     * */
    function downloadImage(info){
        /* info = {
            gameId:"",
            size:{width:"",height:"",ratio:""},
            url:"",
            type:"cover",
            method:"xhr"
        };*/

        //GET COVER IMAGE FOR THE GAME!
        var toDld = info.url
            .replace("[WSIZE]", info.size.width)
            .replace("[HSIZE]", info.size.height)
            .split("?")[0];

        //toDld = "http://lorempixel.com/g/"+info.size.width+"/"+info.size.height+"/";
        //toDld = encodeURI(toDld);

        var gameFolder = constants.GAMES_DIR + info.gameId;
        // var imagesFolder = gameFolder + "/images/" + info.type + "/";
        var imageName = info.type + "_" + info.size.width + "x" + info.size.height + ("_"+info.size.ratio || "") + ".jpeg";
        LOG.d("request Image to", toDld, "coverImageUrl", imageName, "imagesFolder", gameFolder);
        if(info.method === "xhr"){
            return Promise.all([
                    fileModule.createFile(gameFolder, imageName),
                    Utils.getImageRaw({url:toDld})
                ]).then(function(results){
                    var entry = results[0];
                    var blob = results[1];

                    return fileModule.appendToFile(entry.path, blob, true, "image/jpeg");
                });
        }else{
            return new fileModule.download(toDld, gameFolder, imageName, function(){}).promise;
        }
    }

    /**
     * getBundleObjects
     *
     * make the jsonpRequests to get the gameObjects.
     * This method is called only if configuration key "bundle_games" is set with an array of gameIDs
     *
     * @returns {Promise<Array>} the gameObject with response_api_dld key
     * */
    Game.prototype.getBundleGameObjects = function(){
        var self = this;
        if(CONF.bundle_games.length > 0){
            LOG.d("Games bundle in configuration", CONF.bundle_games);
            var whichGameAlreadyHere = CONF.bundle_games.map(function(gameId){
                return self.isGameDownloaded(gameId);
            });

            var filteredToDownload = Promise.all(whichGameAlreadyHere)
                .then(function(results){
                    LOG.d("alreadyDownloaded",results);
                    for(var i = 0;i < results.length;i++){
                        if(results[i]) CONF.bundle_games.splice(i, 1);
                    }
                    return CONF.bundle_games;
                })
                .then(function(bundlesGamesIds){
                    return bundlesGamesIds.join(",");
                });

            var tmpBundleGameObjects;
            return filteredToDownload
                .then(function(bundleGamesIds){

                    obj.content_id = bundleGamesIds;
                    var api_string = querify(CONF.api, obj);
                    LOG.d("Request bundle games meta info:", api_string);

                    return new jsonpRequest(api_string).prom;
                }).then(function(bundleGameObjects){
                    LOG.d("Games bundle response:", bundleGameObjects);
                    tmpBundleGameObjects = bundleGameObjects;
                    var jsonpRequests = bundleGameObjects.map(function(item){
                        return new jsonpRequest(item.url_api_dld).prom;
                    });
                    LOG.d("jsonpRequests",jsonpRequests);
                    return Promise.all(jsonpRequests);
                })
                .then(function(results){
                    LOG.d("RESULTS", results);

                    //extend with the response object
                    for(var i = 0;i < results.length;i++){
                        tmpBundleGameObjects[i].response_api_dld =  results[i];
                    }

                    LOG.d("GameObjects", tmpBundleGameObjects);
                    return tmpBundleGameObjects;
                })
                .catch(function(reason){
                    LOG.e("Games bundle meta fail:", reason);
                });
        }else{
            LOG.w("Bundle_games array is empty!");
            return Promise.reject("bundle_games array is empty!");
        }
    };

    /**
     * needsUpdate
     * checks if there's or not a new version for the game(it makes a call to the api)
     *
     * @param {String} gameId - the gameId
     * @param {Promise<Boolean>}
     * */
    Game.prototype.needsUpdate = function(gameId){
        var oldMd5 = "";
        return fileModule.readFileAsJSON(constants.GAMES_DIR + gameId + "/meta.json")
            .then(function(gameObject){
                oldMd5 = gameObject.response_api_dld.binary_md5;
                return Utils.getJSON(gameObject.url_api_dld);
            })
            .then(function(response){
                if(response.status === 200){
                    return response.binary_md5 !== oldMd5;
                }else{
                    throw new Error("ResponseStatus " + response.status);
                }
            });
    };

    function readUserJson(){
        LOG.i("readUserJson", constants.BASE_DIR + "user.json");
        return fileModule.readFileAsJSON(constants.BASE_DIR + "user.json");
    }

    function storeOfflineData(content_id){
        /**
         * Calls for offlineData.json
         * putting GamifiveInfo and GaForGame in this file for each game
         * {
         *  GamifiveInfo:<content_id>:{<gamifive_info>},
         *  queues:{}
         * }
         * */
        // var apiGaForGames = querify(CONF.ga_for_game_url, ga_for_games_qs);
        // var getGaForGamesTask = new jsonpRequest(apiGaForGames).prom;
        
        // var tasks = Promise.all([getGaForGamesTask, readUserJson()]);

        return readUserJson().then(function(userJson){

            if(!userJson.ponyUrl){
                LOG.w("ponyUrl in user check undefined!", userJson.ponyUrl);
                throw new Error("Not premium user");
            }

            var _PONYVALUE = userJson.ponyUrl.split("&_PONY=")[1];
            LOG.d("PONYVALUE", _PONYVALUE);
            
            var gamifive_api = querify(CONF.gamifive_info_api, {
                content_id:content_id,           
                format:"jsonp"
            });

            gamifive_api += userJson.ponyUrl;

            LOG.d("Call game_info api: ", gamifive_api);
            return new jsonpRequest(gamifive_api).prom;

        }).then(function(result){
            if (result.status === 403 || result.status !== 200){
                throw new Error("Error retrieving game_info", result);
            }            
            LOG.d("Save game_Info: ", "OK");
            return updateOfflineData({content_id:content_id, gamifive_info:result.game_info});            
        });
    }

    function updateOfflineData(object){
        return fileModule.readFileAsJSON(constants.BASE_DIR + "offlineData.json")
            .then(function(offlineData){
                offlineData.GamifiveInfo[object.content_id] = object.gamifive_info;
                return offlineData;
            })
            .then(function(offlineDataUpdated){
                LOG.d("writing offlineData.json", offlineDataUpdated);
                return fileModule.write(constants.BASE_DIR + "offlineData.json", JSON.stringify(offlineDataUpdated));
            });
    }
    
    var _protected = {};
    _modules.game = {};

    _protected.initialize = initialize;
    _modules.game._protected = _protected;
    _modules.game._public = new Game();

})(stargateModules.file, stargateModules.Utils, stargateModules);
/**
 * EventBus module
 * @module src/modules/EventBus
 * @type {Object}
 */
/* globals ActiveXObject */
(function(_modules){

	"use strict";
	/**
	 * @class 
	 * */
	function EventBus(){
		this.events = {};
	}

	/**
	 * on function
	 * @param {String} eventType - if not exists it defines a new one
	 * @param {Function} func - the function to call when the event is triggered
	 */
	EventBus.prototype.on = function(eventType, func){
		if(!this.events[eventType]){ this.events[eventType] = [];}
		this.events[eventType].push(func);
	};

	/**
	 * trigger function
	 * @param {String} eventType - the eventType to trigger. if not exists nothing happens
	 * @param {Object} data - the object data to pass to the callback functions
	 */
	EventBus.prototype.trigger = function(eventType, data){
		if(!this.events[eventType] || this.events[eventType] < 1){ return; }
		
		this.events[eventType].map(function(func){
			func.call(null, data || {});
		});
	};

	/**
	 * remove function
	 * @param {String} eventType - the eventType
	 * @param {Function} func - the reference of the function to remove from the list of function
	 */
	EventBus.prototype.remove = function(eventType, func){
		if(!this.events[eventType]){ return; }

		var index = this.events[eventType].indexOf(func);
		if(index > -1){
			this.events[eventType].splice(index, 1);
		}
	};

	_modules.EventBus = EventBus;

})(stargateModules);
/**
 * Decoratos module
 * @module src/modules/Decorators
 * @type {Object} 
 */
(function(_modules){
    
    /**
     * Decorator function: 
     * @private
     * @param {Boolean|Function} param - the require param or function. the function should return a boolean 
     * @param {Function} fn - the function to decorate     
     * @param {Object} [context=null] - the optional this-context. default to null
     * @param {String} [message="NoMessage"]
     * @param {String} [type="warn"]
     * @returns {Function} 
     */
    function requireCondition(param, afterFunction, context, message, type){ 
        return function(){
            if(typeof param === "function"){
                param = param.call(null);
            }
            if(param){
                return afterFunction.apply(context || null, arguments); 
            } else {
                message = message || "NoMessage";
                switch(type){
                    case "warn":
                        console.warn(message);
                        break;
                    case "error":
                        console.error(message);
                        break;
                    case "info":
                        console.info(message);
                        break;
                    default:
                        console.log(message);
                }                
            }
        };
    }    
    
    _modules.Decorators = {
        requireCondition:requireCondition
    };
    
})(stargateModules);

/**
 * AdManager module needs https://github.com/appfeel/admob-google-cordova
 * @module src/modules/AdManager
 * @type {Object}
 * @requires ./Utils.js,./Decorators.js
 */
(function(Utils, Decorators, _modules){

    var admobid = {};

    if(/(android)/i.test(navigator.userAgent) ) {
        admobid = { // for Android
            banner: 'ca-app-pub-6869992474017983/9375997553',
            interstitial: 'ca-app-pub-6869992474017983/1657046752'
        };
    } else if(/(ipod|iphone|ipad)/i.test(navigator.userAgent)) {
        admobid = { // for iOS
            banner: 'ca-app-pub-6869992474017983/4806197152',
            interstitial: 'ca-app-pub-6869992474017983/7563979554'
        };
    } else {
        admobid = { // for Windows Phone
            banner: 'ca-app-pub-6869992474017983/8878394753',
            interstitial: 'ca-app-pub-6869992474017983/1355127956'
        };
    }

    function AdManager(){
        this.LOG = new Utils.Logger("OFF", "ADMANAGER");
    }
    
    var platform;    
    var supportedPlatform = ["ios","android"];
    function checkSupport(arr, val) {
        return arr.some(function(arrVal){ return val === arrVal;});
    }
    
    AdManager.prototype.initialize = function(options){
        platform = window.device.platform.toLowerCase();
        
        if(checkSupport(supportedPlatform, platform)){
            this.AD_TYPE = window.admob.AD_TYPE;
            this.AD_SIZE = window.admob.AD_SIZE;
            this.LOG = new Utils.Logger("all","[AdManager]");
            this.LOG.i("initialize admob with", platform, options[platform]);
            this.setOptions(options[platform]);
            return Promise.resolve("OK");           
        } else {
            return Promise.reject([platform, "Unsupported"].join(" "));
        }        
    };
    
    AdManager.prototype.createBanner = function(options){
        this.LOG.i("createBanner");
        var self = this;
        options = Utils.extend(self.options, options || {});
        return new Promise(function(resolve, reject){
            window.admob.createBannerView(options, resolve, reject);
        });
    };
    
    AdManager.prototype.removeBanner = function(){
        window.admob.destroyBannerView();
        return Promise.resolve("OK");
    };
    
    AdManager.prototype.showBanner = function(){
        return new Promise(function(resolve, reject){
            window.admob.showBannerAd(true, resolve, reject);
        });
    };
    
    AdManager.prototype.showBannerAtGivenXY = function(){this.LOG.d("NotImplemented");};
    AdManager.prototype.showBannerAtSelectedPosition = function(){this.LOG.d("NotImplemented");};
    
    AdManager.prototype.hideBanner = function(){        
        return new Promise(function(resolve, reject){
            window.admob.showBannerAd(false, resolve, reject);
        });        
    };
    
    AdManager.prototype.prepareInterstitial = function(options){
        var self = this;
        return new Promise(function(resolve, reject){
            window.admob.requestInterstitialAd(Utils.extend(self.options, options || {}), resolve, reject);                        
        });
    };
    
    AdManager.prototype.showInterstitial = function(){
        return new Promise(function(resolve, reject){
            window.admob.showInterstitialAd(resolve, reject);
        });
    };
    
    AdManager.prototype.registerAdEvents = function(eventManager){
        this.LOG.d("NotImplemented", eventManager);
    };
    
    AdManager.prototype.setOptions = function(options){
        this.options = options || {};
        window.admob.setOptions(options || {});
    };

    function isCordovaPluginDefined(){
        return window.admob !== "undefined";
    }
    
    // unwrap it as soon as implemented
    for(var method in AdManager.prototype){
        if(AdManager.prototype.hasOwnProperty(method)){
            AdManager.prototype[method] = Decorators.requireCondition(isCordovaPluginDefined, 
                                AdManager.prototype[method], 
                                AdManager.prototype, 
                                "try cordova plugin add cordova-admob:plugin not installed", 
                                "warn");
        }
    }
    
    _modules.AdManager = new AdManager();

})(stargateModules.Utils, stargateModules.Decorators, stargateModules);

var webappsFixes = (function() {


	var waf = {};
	var enabled = false;

	waf.init = function() {
		if (stargateConf.hasOwnProperty('webappsfixes') && 
			typeof stargateConf.webappsfixes === 'object') {

			enabled = true;

			// execute all fixes found in conf
			for (var fixName in stargateConf.webappsfixes) {
				if (stargateConf.webappsfixes.hasOwnProperty(fixName)) {
					

					if (fixes.hasOwnProperty(fixName) && typeof fixes[fixName] === 'function') {

						log("[webappsFixes] applying fix: "+fixName);
						
						var error = fixes[fixName](stargateConf.webappsfixes[fixName]);

						if (error) {
							err("[webappsFixes] fix '"+fixName+"' failed: "+error);
						}
					}
					else {
						err("[webappsFixes] fix implementation not found for: "+fixName);
					}
				}
			}

		}

		return enabled;
	};

	// fixes function must return an empty string when result is ok and
	//  a string describing the error when there is one error
	var fixes = {};
	fixes.gamifiveSearchBox = function(conf) {
		// 

		if (! window.cordova || ! window.cordova.plugins || ! window.cordova.plugins.Keyboard) {
			return "missing ionic-plugin-keyboard";
		}

		if (conf.platforms) {
			if (isRunningOnIos() && ! conf.platforms.ios) {
				log('[webappsFixes] [gamifiveSearchBox] fix disabled on iOS');
                return;
			}
			if (isRunningOnAndroid() && ! conf.platforms.android) {
				log('[webappsFixes] [gamifiveSearchBox] fix disabled on Android');
				return;
			}
		}

		window.addEventListener(
			'native.keyboardshow',
			function(){
				setTimeout(function() {
					if (document.querySelectorAll('input:focus').length === 0) {
						log('[webappsFixes] [gamifiveSearchBox] keyboard show on null input: hiding');
						
						cordova.plugins.Keyboard.close();
					}
				},
				1);
			},
			false
		);

		log('[webappsFixes] [gamifiveSearchBox] listening on event native.keyboardshow');


		return '';
	};

	//window.addEventListener('native.keyboardshow', function(){ console.log('keyboardshow start'); if($(':focus')===null){console.log('keyboard show on null input, hiding');cordova.plugins.Keyboard.close()} console.log('keyboardshow finish') }, false)

	return waf;
})();


stargateModules.statusbar = (function(){

    var sbProtected = {};
    
    sbProtected.initialize = function(initializeConf) {
        if (typeof window.StatusBar === "undefined") {
            // missing cordova plugin
            return err("[StatusBar] missing cordova plugin");
        }
        
        
        if (!initializeConf ||
            initializeConf.constructor !== Object ||
            Object.keys(initializeConf).length === 0) {
                
            if (stargateConf.statusbar) {
                initializeConf = stargateConf.statusbar;
            } else {
                return;
            }
        }
        
        if (typeof initializeConf.hideOnUrlPattern !== "undefined" && 
            initializeConf.hideOnUrlPattern.constructor === Array) {

            var currentLocation = document.location.href;
            var hide = false;

            for (var i=0; i<initializeConf.hideOnUrlPattern.length; i++) {

                var re = new RegExp(initializeConf.hideOnUrlPattern[i]);
                
                if (re.test(currentLocation)) {
                    hide = true;
                    break;
                }
            }
            
            
            if (hide) {
                window.StatusBar.hide();
            }
            else {
                window.StatusBar.show();
            }
        }
        
        if (initializeConf.color) {
            //log("color: "+initializeConf.color);
            window.StatusBar.backgroundColorByHexString(initializeConf.color);
        }
    };
    
    sbProtected.setVisibility = function(visibility, callbackSuccess, callbackError) {
        if (typeof window.StatusBar === "undefined") {
            // missing cordova plugin
            err("[StatusBar] missing cordova plugin");
            return callbackError("missing cordova plugin");
        }

        if (visibility) {
            window.StatusBar.show();
            return callbackSuccess("statusbar shown");
        }

        window.StatusBar.hide();
        return callbackSuccess("statusbar hided");
    };
    
    return sbProtected;
})();


stargatePublic.setStatusbarVisibility = function(visibility, callbackSuccess, callbackError) {

    if (!isStargateInitialized) {
        return callbackError("Stargate not initialized, call Stargate.initialize first!");
    }
    if (!isStargateOpen) {
        callbackError("Stargate closed, wait for Stargate.initialize to complete!");
        return false;
    }

    return stargateModules.statusbar.setVisibility(visibility, callbackSuccess, callbackError);
};

// global variable used by old stargate client
// @deprecated since v0.1.2
window.pubKey = '';
// @deprecated since v0.1.2
window.forge = '';



/**
 * Stargate application configuration getters namespace
 */
stargatePublic.conf = {};

/**
 * Get url of webapp starting page when hybrid
 * @returns {String}
 */
stargatePublic.conf.getWebappStartUrl = function() {
    if (!isStargateInitialized) {
        return err("Stargate not initialized, call Stargate.initialize first!");
    }
    // if (!isStargateOpen) {
    //     return err("Stargate closed, wait for Stargate.initialize to complete!");
    // }

    return getHybridStartUrl(stargateConf.webapp_start_url);
};

var getHybridStartUrl = function(starturl, optionalSearchVals) {
    var webappStartUrl = URI(starturl)
        .addSearch("hybrid", "1")
        .addSearch("stargateVersion", getStargateVersionToLoad());

    if (optionalSearchVals && (typeof optionalSearchVals === 'object')) {
        for (var optionalSearchKey in optionalSearchVals) {
            if (optionalSearchVals.hasOwnProperty(optionalSearchKey)) {
                webappStartUrl.addSearch(optionalSearchKey,  optionalSearchVals[optionalSearchKey]);
            }
        }
    }
    return String(webappStartUrl);
};

var getStargateVersionToLoad = function() {
    if (stargateConf.stargate_version_to_load) {
        return stargateConf.stargate_version_to_load;
    }

    war("getStargateVersionToLoad() stargate_version_to_load must be set on manifest!");
    // return deprecated value
    return stargateVersion;
};

/**
 * Get webapp url origin
 * @returns {String}
 */
stargatePublic.conf.getWebappOrigin = function() {
    var re = /http:\/\/[\w]{3,4}\..*\.[\w]{2,}/;
    if(typeof stargateConf.webapp_start_url === "undefined"){
        log("Stargate is initialized? Please call this method after it");
        return "";
    }else{
        return re.exec(stargateConf.webapp_start_url)[0];
    }
};

/**
 * Get a value from stargate configuration on manifest.json
 * 
 * @returns value of the corresponding manifest key (inside stargateConf)
 */
stargatePublic.conf.getManifestValue = function(manifestKey) {
    if (!isStargateInitialized) {
        return err("Stargate not initialized, call Stargate.initialize first!");
    }
    
    return stargateConf[manifestKey];
};

var initializePromise;

/**
*
* initialize(configurations, callback)
* @param {object} [configurations={}] - an object with configurations
* @param @deprecated [configurations.country=undefined] - MFP country @deprecated since 0.2.3
* @param @deprecated [configurations.hybrid_conf={}] - old configuration of modules, used by IAP @deprecated since 0.2.3
* @param [configurations.modules=["mfp","iapbase","appsflyer"]] - array with one or more of: "mfp","iapbase","iap","appsflyer","game"
* @param [configurations.modules_conf={}] - an object with configurations for modules
* @param {Function} [callback=function(){}] - callback success
* @returns {Promise<boolean>} - true if we're running inside hybrid
*
* @deprecated initialize(configurations, pubKey, forge, callback)
*/
stargatePublic.initialize = function(configurations, pubKeyPar, forgePar, callback) {

    // parameters checking to support both interfaces:
    //    initialize(configurations, callback)
    //    initialize(configurations, pubKey, forge, callback)
    if (typeof pubKeyPar === 'function' &&
        typeof forgePar === 'undefined' &&
        typeof callback === 'undefined') {
        // second parameter is the callback
        callback = pubKeyPar;
    }

    if(typeof callback === 'undefined'){
        log("Callback success not setted. \n You can use 'then'");
        callback = function(){};
    }
    // check callback type is function
    // if not return a failing promise
    if (typeof callback !== 'function') {
        war("Stargate.initialize() callback is not a function!");
        return Promise.reject(new Error("Stargate.initialize() callback is not a function!"));
    }

    isStargateRunningInsideHybrid = isHybridEnvironment();

    // if i'm already initialized just:
    //  * execute the callback
    //  * return a resolving promise
    if (isStargateInitialized) {
        war("Stargate.initialize() already called, executing callback.");

        if(callback){callback(isStargateRunningInsideHybrid);}

        return initializePromise;
    }

    if (typeof configurations !== 'object') {
        configurations = {};
    }

    // old configuration mechanism, used by IAP
    if(configurations.hybrid_conf){
        if (typeof configurations.hybrid_conf === 'object') {
            hybrid_conf = configurations.hybrid_conf;
        } else {
            hybrid_conf = JSON.parse(decodeURIComponent(configurations.hybrid_conf));
        }
    }

    if(configurations.modules){
        // save modules requested by caller,
        // initialization will be done oly for these modules

        // check type
        if (configurations.modules.constructor !== Array) {
            err("initialize() configurations.modules is not an array");
        }
        else {
            requested_modules = configurations.modules;
        }
    } else {
        // default modules
        requested_modules = ["mfp","iapbase","appsflyer","game"];
    }
    if(configurations.modules_conf){
        // check type
        if (typeof configurations.modules_conf !== 'object') {
            err("initialize() configurations.modules_conf is not an object");
        }
        else {
            modules_conf = configurations.modules_conf;
        }
    }

    // old configuration mechanism, used by MFP module
    if(configurations.country) {
        // overwrite conf
        if ("mfp" in hybrid_conf) {
            hybrid_conf.mfp.country = configurations.country;
        }
        // define conf
        else {
            hybrid_conf.mfp = {
                "country": configurations.country
            };
        }
    }

    // if not running inside hybrid save the configuration then:
    //  * call the callback and return a resolving promise
    if (!isStargateRunningInsideHybrid) {

        log("version "+stargatePackageVersion+" running outside hybrid ");

        if(callback){callback(isStargateRunningInsideHybrid);}

        initializePromise = Promise.resolve(isStargateRunningInsideHybrid);
        isStargateInitialized = true;
        return initializePromise;
    }

    log("initialize() starting up, configuration: ",hybrid_conf);

    initializeCallback = callback;

    initializePromise = new Promise(function(resolve,reject){

        var deviceReadyHandler = function() {
            onDeviceReady(resolve, reject);
            document.removeEventListener("deviceready",deviceReadyHandler, false);
        };

        // finish the initialization of cordova plugin when deviceReady is received
        document.addEventListener('deviceready', deviceReadyHandler, false);
    });

    isStargateInitialized = true;

    return initializePromise;
};

stargatePublic.isInitialized = function() {
    return isStargateInitialized;
};

stargatePublic.isOpen = function() {
    return isStargateOpen;
};

stargatePublic.isHybrid = function() {
    return isHybridEnvironment();
};

stargatePublic.openUrl = function(url) {

	if (!isStargateInitialized) {
		return err("Stargate not initialized, call Stargate.initialize first!");
    }
    if (!isStargateOpen) {
        err("Stargate closed, wait for Stargate.initialize to complete!");
        return false;
    }

    if(!(window.cordova && window.cordova.InAppBrowser && window.cordova.InAppBrowser.open)){
        err("Missing cordova plugin InAppBrowser");
        return false;
    }

    log("[openUrl] opening: "+url);
    window.open(url, "_system");
    return true;
};

stargatePublic.googleLogin = function(callbackSuccess, callbackError) {

	if (!isStargateInitialized) {
		return callbackError("Stargate not initialized, call Stargate.initialize first!");
    }

    // FIXME: implement it; get code from old stargate

    err("unimplemented");
    callbackError("unimplemented");
};

var connectionStatus = {
    type: "unknown",
    networkState: "unknown"
};

var onConnectionChange;
/**
 * Stargate.addListener
 * @param {String} type - possible values: "connectionchange"
 * @param {Function} _onConnectionChange
 * **/
stargatePublic.addListener = function(type, _onConnectionChange){
    //if not already registered
    if(type == "connectionchange" && (typeof _onConnectionChange === "function")){
        log("onConnectionChange registered");
        onConnectionChange = _onConnectionChange;
    }
};

function updateConnectionStatus(theEvent){
    connectionStatus.type = theEvent.type;
    connectionStatus.networkState = navigator.connection.type;
    if(typeof onConnectionChange === "function"){onConnectionChange(connectionStatus);}
}

function bindConnectionEvents(){
    document.addEventListener("offline", updateConnectionStatus, false);
    document.addEventListener("online", updateConnectionStatus, false);
}

function initializeConnectionStatus() {
    connectionStatus.networkState = navigator.connection.type;

    if (navigator.connection.type === "none") {
        connectionStatus.type = "offline";
    } else {
        connectionStatus.type = "online";
    }
}

/**
 * checkConnection function returns the updated state of the client connection
 * @param {Function} [callbackSuccess=function(){}] - callback success filled with: {type:"online|offline",networkState:"wifi|3g|4g|none"}
 * @param {Function} [callbackError=function(){}] - called if stargate is not initialize or cordova plugin missing
 * @returns {Object|boolean} connection info {type:"online|offline",networkState:"wifi|3g|4g|none"}
 * */
stargatePublic.checkConnection = function() {

    var callbackSuccess = arguments.length <= 0 || arguments[0] === undefined ? function(){} : arguments[0];
    var callbackError = arguments.length <= 1 || arguments[1] === undefined ? function(){} : arguments[1];

	if (!isStargateInitialized) {
		callbackError("Stargate not initialized, call Stargate.initialize first!");
        return false;
    }
    if (!isStargateOpen) {
        callbackError("Stargate closed, wait for Stargate.initialize to complete!");
        return false;
    }

    if(typeof navigator.connection === "undefined" ||
        typeof navigator.connection.getInfo !== "function"){

        callbackError("Missing cordova plugin");
        console.warn("Cordova Network Information module missing");
        return false;
    }

    callbackSuccess(connectionStatus);
    return connectionStatus;
};
stargatePublic.getDeviceID = function(callbackSuccess, callbackError) {

	if (!isStargateInitialized) {
		return callbackError("Stargate not initialized, call Stargate.initialize first!");
    }
    if (!isStargateOpen) {
        callbackError("Stargate closed, wait for Stargate.initialize to complete!");
        return false;
    }

    // FIXME: check that device plugin is installed
    // FIXME: integrate with other stargate device handling method

    var deviceID = runningDevice.uuid;
    callbackSuccess({'deviceID': deviceID});
};

/**
 * loadUrl
 * @protected
 * @param {String} url - an uri string
 * */
function loadUrl(url){

    if(window.device.platform.toLowerCase() == "android"){
        window.navigator.app.loadUrl(url);
    }else if(window.device.platform.toLowerCase() == "ios" && (url.indexOf("file:///") !== -1)){
        //ios and url is a file:// protocol
        var _url = url.split("?")[0];
        log("Without qs", _url);
        window.resolveLocalFileSystemURL(_url, function(entry){
            var internalUrl = entry.toInternalURL() + "?hybrid=1";
            log("Redirect to", internalUrl);
            window.location.href = internalUrl;
        }, err);
    }else{
        window.location.href = url;
    }
}

/**
 * goToLocalIndex
 * redirect the webview to the local index.html
 * */
stargatePublic.goToLocalIndex = function(){
    if(window.cordova.file.applicationDirectory !== "undefined"){
        var qs = "?hybrid=1";
        var LOCAL_INDEX = window.cordova.file.applicationDirectory + "www/index.html";
        loadUrl(LOCAL_INDEX + qs);
    }else{
        err("Missing cordova-plugin-file. Install it with: cordova plugin add cordova-plugin-file");
    }
};

/**
 * goToWebIndex
 * redirect the webview to the online webapp
 * */
stargatePublic.goToWebIndex = function(){
    var webUrl = stargatePublic.conf.getWebappStartUrl() + "";
    log("Redirect to", webUrl);
    loadUrl(webUrl);
};

stargatePublic.getVersion = function() {
    return stargatePackageVersion;
};

/**
 * @return {object} application information;
 *
 * this information are available only after initialize complete
 *
 * object keys returned and meaning
 *
 *  cordova: Cordova version,
 *  manufacturer: device manufacter,
 *  model: device model,
 *  platform: platform (Android, iOs, etc),
 *  deviceId: device id or UUID,
 *  version: platform version,
 *  packageVersion: package version,
 *  packageName: package name ie: com.stargatejs.test,
 *  packageBuild: package build number,
 *  stargate: stargate version,
 *  stargateModules: stargate modules initialized,
 *  stargateError: stargate initialization error
 *
 */
stargatePublic.getAppInformation = function() {
    return appInformation;
};


/**
 * @return {array} list of available features;
 *
 * this list is available only after initialize complete
 *
 */
stargatePublic.getAvailableFeatures = function() {
    return getAvailableFeatures();
};

/* globals SpinnerDialog */

/***
* 
* 
* 
*/

// current stargateVersion used by webapp to understand
//  the version to load based on cookie or localstorage
// @deprecated since 0.2.2
var stargateVersion = "2";


/**
 * when is_staging is true we log with parameters, 
 * when is false we log with only one parameter
 *   because cordova.console on android doesn't support more than 
 *   one paramenter and in release version we only can see console
 *   logs with cordova console plugin.
 */ 
var is_staging = 0;


var argsToString = function() {
    var args = Array.prototype.slice.call(arguments);
    var result = '';
    for (var i=0; i<args.length; i++) {
        if (typeof (args[i]) === 'object') {
            result += " " + JSON.stringify(args[i]);
        }
        else {
            result += " " + args[i];
        }
    }
    return result;
};

// logger function
var log = console.log.bind(window.console, "[Stargate] ");
var err = console.error.bind(window.console, "[Stargate] ");
var war = console.warn.bind(window.console, "[Stargate] ");
if (!is_staging) {
    log = function(){
        console.log("[I] [Stargate] "+argsToString.apply(null, arguments));
    };
    err = function(){
        console.log("[E] [Stargate] "+argsToString.apply(null, arguments));
    };
    war = function(){
        console.log("[W] [Stargate] "+argsToString.apply(null, arguments));
    };
}


// device informations   // examples
var runningDevice = {
    available: false,    // true
    cordova: "",         // 4.1.1
    manufacturer: "",    // samsung
    model: "",           // GT-I9505
    platform: "",        // Android
    uuid: "",            // ac7245e38e3dfecb
    version: ""          // 5.0.1
};
var isRunningOnAndroid = function() {
    return runningDevice.platform == "Android";
};
var isRunningOnIos = function() {
    return runningDevice.platform == "iOS";
};
// - not used, enable if needed -
//var isRunningOnCordova = function () {
//    return (typeof window.cordova !== "undefined");
//};
var initDevice = function() {
    if (typeof window.device === 'undefined') {
        return err("Missing cordova device plugin");
    }
    for (var key in runningDevice) {
        if (window.device.hasOwnProperty(key)) {
            runningDevice[key] = window.device[key];
        }
    }
    return true;
};

function getAppIsDebug() {
    if (window.cordova && window.cordova.plugins && window.cordova.plugins.AppIsDebug) {
        return new Promise(function(resolve,reject){
            window.cordova.plugins.AppIsDebug.get(
                function(appinfo){
                    resolve(appinfo);
                },
                function(error){
                    err("getAppIsDebug(): "+error, error);
                    reject(new Error(error));
                }
            );
        });
    }
    
    err("getAppIsDebug(): plugin not available!");
    return Promise.resolve({});
}

function getManifestWithCordovaFilePlugin() {
    var url = window.cordova.file.applicationDirectory + "www/manifest.json";

    return new Promise(function(resolve, reject){
        window.resolveLocalFileSystemURL(url, resolve, reject);
    })
    .then(function(fileEntry) {

        return new Promise(function(resolve, reject){
            fileEntry.file(function(file) {
                var reader = new FileReader();
                reader.onerror = reject;
                reader.onabort = reject;

                reader.onloadend = function() {
                    var textToParse = this.result;
                    resolve(textToParse);
                };
                reader.readAsText(file);
            });
        });
    })
    .then(function(fileContent) {
        var jsonParsed = '';
        try{
            jsonParsed = window.JSON.parse(fileContent);
        }
        catch(e){
            return Promise.reject(e);
        }

        return Promise.resolve(jsonParsed);
    })
    .catch(function(e) {
        console.error("getManifestWithCordovaFilePlugin() error:"+e, e);
    });
}

function getManifest() {
    
    if (window.hostedwebapp) {
        return new Promise(function(resolve,reject){
            window.hostedwebapp.getManifest(
                function(manifest){
                    resolve(manifest);
                },
                function(error){
                    err(error);
                    reject(new Error(error));
                }
            );
        });
    }

    if (window.cordova.file) {
        return getManifestWithCordovaFilePlugin();
    }
    
    err("getManifest() no available reading mechanism!");
    return Promise.resolve({});
}

var getCountryPromise = function(stargateConfCountries) {

    return new Promise(function(resolve,reject){

        window.aja()
            .method('GET')
            .url(stargateConfCountries.apiGetCountry)
            .cache(false)
            .timeout(10000) // ten seconds
            .on('success', function(result){
                resolve(result.realCountry);
            })
            .on('error', function(error){
                err("getCountryPromise() api call "+stargateConfCountries.apiGetCountry+
                " failed: "+JSON.stringify(error));
                reject(new Error(error));
            })
            .on('4xx', function(error){
                err("getCountryPromise() api call "+stargateConfCountries.apiGetCountry+
                " failed: "+JSON.stringify(error));
                reject(new Error(error));
            })
            .on('5xx', function(error){
                err("getCountryPromise() api call "+stargateConfCountries.apiGetCountry+
                " failed: "+JSON.stringify(error));
                reject(new Error(error));
            })
            .on('timeout', function(){
                err("getCountryPromise() api call "+stargateConfCountries.apiGetCountry+
                " failed: Timeout 10s!");
                reject(new Error("Timeout 10s!"));
            })
            .go();
    });
};

var launchUrl = function (url) {
    log("launchUrl: "+url);
    document.location.href = url;
};


var isStargateRunningInsideHybrid = false;
var isStargateInitialized = false;
var isStargateOpen = false;
var initializeCallback = null;

/**
 * appVersion: version number of the app
 */
var appVersion = '';
/**
 * appBuild: build identifier of the app
 */
var appBuild = '';
/**
 * appPackageName: package name of the app - the reversed domain name app identifier like com.example.myawesomeapp
 */
var appPackageName = '';

/**
 * appIsDebug {Boolean} true if app is compiled in debug mode
 */
var appIsDebug = false;

/**
 * InApp Purchase module type:
 *  1 => use cordova plugin https://github.com/j3k0/cordova-plugin-purchase
 *  2 => use cordova plugin https://github.com/AlexDisler/cordova-plugin-inapppurchase
 */
var stargateIapType = 0;

var STARGATEIAPTYPES = {
    /**
     * use cordova plugin https://github.com/j3k0/cordova-plugin-purchase
     */
    "full": 1,

    /**
     * use cordova plugin https://github.com/AlexDisler/cordova-plugin-inapppurchase
     */
    "light": 2,
    
    1: "full",
    2: "light"
};

/**
 * 
 * variables sent by server configuration
 * 
 */
var hybrid_conf = {},
    requested_modules = [],
    modules_conf = {};

/**
 * 
 * Application information set on initialize
 * 
 */
var appInformation = {
    cordova: null,
    manufacturer: null,
    model: null,
    platform: null,
    deviceId: null,
    version: null,
    packageVersion: null,
    packageName: null,
    packageBuild: null,
    stargate: null,
    stargateModules: null,
    stargateError: null,
    features: null
};

/**
* Set on webapp that we are hybrid
* (this will be called only after device ready is received and 
*   we are sure to be inside cordova app)
*/
var setIsHybrid = function() {   

    window.Cookies.set("hybrid", "1");
    
    var cookieDomain = getCookieDomain();
    if(cookieDomain){
        window.Cookies.set("hybrid", "1", {"domain": cookieDomain});        
    }


    if (!window.localStorage.getItem('hybrid')) {
        window.localStorage.setItem('hybrid', 1);
    }
};

var getCookieDomain = function() {
    var re = new RegExp(/(^https?:\/\/)(.*)/);
    var result = re.exec(window.location.origin);
    
    if(!result){
        return false;
    }

    var cookieDomain = result[result.length - 1]
        .split('.')
        .filter(function(el){
            return !(el === 'www' || el === 'www2');
        }).join('.');
    
    return cookieDomain;
};

/**
* Set on webapp what version we need to load
* (this will be called only after manifest is loaded on stargate)
*/
var setHybridVersion = function() {

    var stargateVersionToLoad = getStargateVersionToLoad();
    window.Cookies.set("stargateVersion", stargateVersionToLoad);

    var cookieDomain = getCookieDomain();
    if(cookieDomain){
        window.Cookies.set("stargateVersion", stargateVersionToLoad, {"domain": cookieDomain});        
    }

    if (!window.localStorage.getItem('stargateVersion')) {
        window.localStorage.setItem('stargateVersion', stargateVersionToLoad);
    }
};

var hideSplashAndLoaders = function() {
    
    
    if (! haveRequestedFeature("leavesplash")) {
        navigator.splashscreen.hide();
    }

    setBusy(false);
    
    if (typeof SpinnerDialog !== "undefined") {
        SpinnerDialog.hide();
    }
};

var onPluginReady = function (resolve) {
    log("onPluginReady() start");

    // FIXME: this is needed ??
    document.title = stargateConf.title;
    
    // set back cordova bridge mode to IFRAME_NAV overriding manifold settings
    if (isRunningOnIos() && (typeof window.cordova !== 'undefined') && window.cordova.require) {
        var exec = window.cordova.require('cordova/exec');
        if (exec.setJsToNativeBridgeMode && exec.jsToNativeModes && exec.jsToNativeModes.IFRAME_NAV) {
            exec.setJsToNativeBridgeMode(exec.jsToNativeModes.IFRAME_NAV);                    
        }
    }
    bindConnectionEvents();
    // save stargate version to load on webapp 
    setHybridVersion();

    
    if (hasFeature("mfp") && haveRequestedFeature("mfp")) {
        var mfpModuleConf = getModuleConf("mfp");
        
        // configurations needed
        //stargateConf.motime_apikey,
	  	//stargateConf.namespace,
        //stargateConf.label,
        
        // configurations needed
        //moduleConf.country
                  
        // retrocompatibility
        var keysOnStargateConf = ["motime_apikey", "namespace", "label", "country"];
        keysOnStargateConf.forEach(function(keyOnStargateConf) {
            // if it's available in stargateConf but not in module conf
            // copy it to module conf
            if (!mfpModuleConf.hasOwnProperty(keyOnStargateConf) &&
                stargateConf.hasOwnProperty(keyOnStargateConf)) {
                    
                mfpModuleConf[keyOnStargateConf] = stargateConf[keyOnStargateConf];
            }
        });
        
        MFP.check(mfpModuleConf);
    }
    
    if (hasFeature("deltadna")) {
        window.deltadna.startSDK(
            stargateConf.deltadna.environmentKey,
            stargateConf.deltadna.collectApi,
            stargateConf.deltadna.engageApi,
            onDeltaDNAStartedSuccess,
            onDeltaDNAStartedError,
            stargateConf.deltadna.settings
        );
    }

    // initialize all modules
    
    stargateModules.statusbar.initialize(
        getModuleConf("statusbar")
    );

    // In-app purchase initialization
    if (haveRequestedFeature("iapbase")) {
        // base legacy iap implementation
        IAP.initialize(
            getModuleConf("iapbase")
        );
        stargateIapType = STARGATEIAPTYPES.full;

    } else if (haveRequestedFeature("iap")) {
        // if initialize ok...
        if ( IAP.initialize( getModuleConf("iap") ) ) {
            // ...then call refresh
            // this doesn't works, so we do it when needed in iap module
            //IAP.doRefresh();
            log("Init IAP done.");
        }
        stargateIapType = STARGATEIAPTYPES.full;
        
    } else if (haveRequestedFeature("iaplight")) {
        // iap new implementation
        // (we don't need to wait for promis to fullfill)
        iaplight.initialize(
            getModuleConf("iaplight")
        );
        stargateIapType = STARGATEIAPTYPES.light;
    }

    // receive appsflyer conversion data event
    if (hasFeature('appsflyer') && haveRequestedFeature("appsflyer")) {
        appsflyer.init(
            getModuleConf("appsflyer")
        );
    }
    
    // apply webapp fixes
    webappsFixes.init();

    codepush.initialize();
    
    if (hasFeature('localpush')) {
        push.initialize()
        .catch(function(e) {
            err("LocalPush initialization error: "+e, e);
        });
    }
    
    
    var modulePromises = [];
    
    //Game Module Init
    // if requested by caller (haveRequestedFeature)
    // if available in app (has feature)
    // if included in code (stargateModules.game)
    if (haveRequestedFeature("game") && hasFeature('game') && stargateModules.game) {
        // save initialization promise, to wait for
        modulePromises.push(
            stargateModules.game._protected.initialize(
                getModuleConf("game")
            )
        );
    }

    if (haveRequestedFeature("adv") && stargateModules.AdManager) {
        // save initialization promise, to wait for
        modulePromises.push(
            stargateModules.AdManager.initialize(
                getModuleConf("adv")
            )
        );
    }

    if (haveRequestedFeature("globalization")) {
        // save initialization promise, to wait for
        modulePromises.push(
            globalization.initialize()
        );
    }
    
    
    // wait for all module initializations before calling the webapp
    Promise.all(
            modulePromises
        )
        .then(function() {
            
            onStargateReady(resolve);
            
        })
        .catch(function (error) {
            err("onPluginReady() error: ",error);
            
            onStargateReady(resolve, error);
        });
};

var onStargateReady = function(resolve, error) {
    log("onStargateReady() start");
    
    hideSplashAndLoaders();
            
    // initialize finished
    isStargateOpen = true;
    
    log("version "+stargatePackageVersion+" ready; "+
        " running in package version: "+appVersion);
    
    appInformation = {
        cordova: runningDevice.cordova,
        manufacturer: runningDevice.manufacturer,
        model: runningDevice.model,
        platform: runningDevice.platform,
        deviceId: runningDevice.uuid,
        version: runningDevice.version,
        packageVersion: appVersion,
        packageName: appPackageName,
        packageBuild: appBuild,
        stargate: stargatePackageVersion,
        features: getAvailableFeatures().join(", ")
    };    
    if (requested_modules && requested_modules.constructor === Array) {
        appInformation.stargateModules = requested_modules.join(", ");
    }
    if (error && (error instanceof Error)) {
        appInformation.stargateError = error.toString();
    }
    if (window.navigator && window.navigator.connection && window.navigator.connection.type) {
        appInformation.connectionType = window.navigator.connection.type;
    }
    
    //execute callback
    initializeCallback(true);

    log("Stargate.initialize() done");
    resolve(true);
};

var onDeviceReady = function (resolve, reject) {
    log("onDeviceReady() start");

    // device ready received so i'm sure to be hybrid
    setIsHybrid();
    
    // get device information
    initDevice();
    
    // get connection information
    initializeConnectionStatus();

    var manifest = '';

    getManifest()
    .then(function(resultManifest){
        log("onDeviceReady() [1/4] got manifest");
        if (typeof resultManifest !== 'object') {
			resultManifest = JSON.parse(resultManifest);
		}

        // save stargateConf got from manifest.json
        stargateConf = resultManifest.stargateConf;
        manifest = resultManifest;

        // execute next promise
        return cordova.getAppVersion.getVersionNumber();
    })
    .then(function(resultAppVersionNumber) {
        log("onDeviceReady() [2/4] got appVersionNumber");
        appVersion = resultAppVersionNumber;

        // execute next promise
        return cordova.getAppVersion.getPackageName();
    })
    .then(function(resultAppPackageName){
        log("onDeviceReady() [3/4] got appPackageName");
        appPackageName = resultAppPackageName;

        // execute next promise
        return cordova.getAppVersion.getVersionCode();
    })
    .then(function(resultAppVersionCode){
        log("onDeviceReady() [4/4] got appPackageName");
        appBuild = resultAppVersionCode;

        // multi country support ?
        if (manifest.stargateConfCountries) {

            getCountryPromise(manifest.stargateConfCountries)
                .then(function(countryFromApi) {
                    log("onDeviceReady() [5/4] got user country");

                    // check if there is a configuration available
                    if (manifest.stargateConfCountries[countryFromApi]) {
                        // overwrite stargateConf
                        stargateConf = manifest.stargateConfCountries[countryFromApi];
                    
                    } else if (manifest.stargateConfCountries.defaultCountry &&
                                manifest.stargateConfCountries[manifest.stargateConfCountries.defaultCountry]) {
                        
                        // overwrite stargateConf with conf of default country
                        stargateConf = manifest.stargateConfCountries[manifest.stargateConfCountries.defaultCountry];
                    }

                    // execute remaining initialization
                    onPluginReady(resolve, reject);
                });

        } else {
            // execute remaining initialization
            onPluginReady(resolve, reject);
        }
    })
    .catch(function (error) {
        err("onDeviceReady() error: "+error);
        reject("onDeviceReady() error: "+error);
    });
};

/**
* Check if we are running inside hybrid environment,  
* checking current url or cookies or localStorage
*/
var isHybridEnvironment = function() {
    return _isHybridEnvironment(document.location.href);
};
var _isHybridEnvironment = function(location) {

    // check url for hybrid query param
    var uri = window.URI(location);
    var protocol = uri.protocol();

    if (protocol === "file" || protocol === "cdvfile") {
        return true;
    }

    if (uri.hasQuery('hybrid')) {
        return true;
    }

    if (window.Cookies.get('hybrid')) {
        return true;
    }

    if (hasLocalStorage() && window.localStorage.getItem('hybrid')) {
        return true;
    }

    // FALLBACK
    if (window.navigator.userAgent.match(/Crosswalk\//) !== null) {
        war("Activated isHybrid from Crosswalk UA");
        return true;
    }

    return false;
};

var hasLocalStorage = function () {
    var isLocalStorageSupported = false;    
    try {      
        window.localStorage.setItem('newton-test', 'pippo');      
        isLocalStorageSupported = window.localStorage.getItem('newton-test') === 'pippo';
        return isLocalStorageSupported;    
    } catch (e) { 
        return isLocalStorageSupported; 
    }
};

var setBusy = function(value) {
    if (value) {
        startLoading();
    }
    else {
        stopLoading();
    }
};

var stargateConf = {
    features: {}
};

/**
 * getModuleConf(moduleName)
 * @param {string} moduleName - name of module to return conf of
 * @returns {object} - configuration for the module sent by Stargate implementator on Stargate.initialize()
 */
var getModuleConf = function(moduleName) {
    // 1. new version -> modules_conf
    // 2. old version -> hybrid_conf
    
    if (!moduleName) {
        return err("getModuleConf() invalid module requested");
    }
    
    if (moduleName in modules_conf) {
        return modules_conf[moduleName];
    }
    
    // covert modulesname
    var mapConfLegacy = {
        "iapbase": "IAP",
        "iap": "IAP"
    };
    
    var moduleNameLegacy = moduleName;
    if (mapConfLegacy[moduleName]) {
        moduleNameLegacy = mapConfLegacy[moduleName];
    }
    
    if (hybrid_conf && moduleNameLegacy in hybrid_conf) {
        return hybrid_conf[moduleNameLegacy];
    }
    
    log("getModuleConf(): no configuration for module: "+moduleName+" ("+mapConfLegacy+")");
    return {};
};

/**
 * hasFeature(feature)
 * @param {string} feature - name of feature to check
 * @returns {boolean} - true if app have feature requested (it check inside the manifest compiled in the app) 
 */
var hasFeature = function(feature) {
    return (typeof stargateConf.features[feature] !== 'undefined' && stargateConf.features[feature]);
};

/**
 * getAvailableFeatures()
 * @returns {Array} - list of features enabled on native (features map on manifest.json)
 */
var getAvailableFeatures = function() {
    var availableFeatures = [];
    for (var feature in stargateConf.features) {
        if (stargateConf.features.hasOwnProperty(feature)) {
            if (stargateConf.features[feature]) {
                availableFeatures.push(feature);
            }
        }
    }
    return availableFeatures;
};

/**
 * haveRequestedFeature(feature)
 * @param {string} feature - name of feature to check
 * @returns {boolean} - true if implementator of Stargate requested the feature (it check against the configuration.modules array sent as paramenter of Stargate.initialize())
 * 
 * possible values: "mfp","iapbase","iap","appsflyer","webappanalytics","game" 
 */
var haveRequestedFeature = function(feature) {
    if (requested_modules && requested_modules.constructor === Array) {
        return requested_modules.indexOf(feature) > -1;
    }
    return false;
};

var share = (function(){

    
	var shareProtected = {};
    
    var getOptions = function(requestedOptions) {
        var availableOptions = ["message", "subject", "files", "chooserTitle"];
        var options = {
            url: requestedOptions.url
        };
        availableOptions.forEach(function(availableOption) {
            if (availableOption in requestedOptions) {
                options[availableOption] = requestedOptions[availableOption];
            }
        });
        return options;
    };

    var getSocialPackage = function(social) {
        if (isRunningOnIos()) {
            if (social === "facebook") {
                return "com.apple.social.facebook";
            }
            if (social === "twitter") {
                return "com.apple.social.twitter";
            }
        }

        return social;
    };
    
	var shareWithChooser = function(requestedOptions, resolve, reject) {
        // this is the complete list of currently supported params you can pass to the plugin (all optional)
        //var fullOptions = {
        //    message: 'share this', // not supported on some apps (Facebook, Instagram)
        //    subject: 'the subject', // fi. for email
        //    files: ['', ''], // an array of filenames either locally or remotely
        //    url: 'https://www.website.com/foo/#bar?a=b',
        //    chooserTitle: 'Pick an app' // Android only, you can override the default share sheet title
        //};
        
        var options = getOptions(requestedOptions);
        
        var onSuccess = function(result) {
            log("[share] Share completed? " + result.completed); // On Android apps mostly return false even while it's true
            log("[share] Shared to app: " + result.app); // On Android result.app is currently empty. On iOS it's empty when sharing is cancelled (result.completed=false)
            
            resolve(result);
        };

        var onError = function(msg) {
            err("[share] Sharing failed with message: " + msg);
            
            reject(msg);
        };

        window.plugins.socialsharing.shareWithOptions(options, onSuccess, onError);
    };
    
    var shareWithFacebook = function(requestedOptions, resolve, reject) {
        var onSuccess = function(result) {
            log("[share] Facebook share completed, result: ", result);
            resolve(result);
        };

        var onError = function(msg) {
            err("[share] Facebook sharing failed with message: " + msg);
            reject(msg);
        };
        
        window.plugins.socialsharing.shareViaFacebook(
            "",
            null,
            requestedOptions.url,
            onSuccess,
            onError
        );
    };
    
    var shareWithTwitter = function(requestedOptions, resolve, reject) {
        var onSuccess = function(result) {
            log("[share] Twitter share completed, result: ", result);
            resolve(result);
        };

        var onError = function(msg) {
            err("[share] Twitter sharing failed with message: " + msg);
            reject(msg);
        };
        
        var message = "";
        if ("message" in requestedOptions) {
            message = requestedOptions.message;
        }
        window.plugins.socialsharing.shareViaTwitter(
            message,
            null,
            requestedOptions.url,
            onSuccess,
            onError
        );
    };
    var shareWithWhatsapp = function(requestedOptions, resolve, reject) {
        var onSuccess = function(result) {
            log("[share] Whatsapp share completed, result: ", result);
            resolve(result);
        };

        var onError = function(msg) {
            err("[share] Whatsapp sharing failed with message: " + msg);
            reject(msg);
        };
        
        var message = "";
        if ("message" in requestedOptions) {
            message = requestedOptions.message;
        }
        
        window.plugins.socialsharing.shareViaWhatsApp(
            message,
            null,
            requestedOptions.url,
            onSuccess,
            onError
        );
    };
    
    shareProtected.canShareVia = function(via, url) {
        
        var viaNative = getSocialPackage(via);

        return new Promise(function(resolve){
            
            // canShareVia: 
            //   via, message, subject, fileOrFileArray, url, successCallback, errorCallback
            window.plugins.socialsharing.canShareVia(
                viaNative,
                null,
                null,
                null,
                url,
                function(e){
                    log("[share] canShareVia "+via+" ("+viaNative+") result true: ", e);
                    resolve({
                        "network": via,
                        "available": true
                    });
                },
                function(e){
                    log("[share] canShareVia "+via+" ("+viaNative+") result false: ", e);
                    resolve({
                        "network": via,
                        "available": false
                    });
                }
            );
        });
    };
    
    
	shareProtected.socialShare = function(options, resolve, reject) {
        
		if (typeof options !== 'object') {
            options = {};
			war("[share] parameter options must be object!");
		}
        
        if (!options.type) {
            options.type = "chooser";
        }

        if (!window.plugins || !window.plugins.socialsharing) {

			// plugin is not installed
            err("[share] missing cordova plugin");
			return reject("missing cordova plugin");
		}
		
        if (!options.url) {
            err("[share] missing parameter url");
            return reject("missing parameter url");
        }
        
        log("[share] Sharing url: "+options.url+" on: "+options.type, options);
        
        if (options.type == "chooser") {
            return shareWithChooser(options, resolve, reject);
        }
        
        if (options.type == "facebook") {
            return shareWithFacebook(options, resolve, reject);
        }
        
        if (options.type == "twitter") {
            return shareWithTwitter(options, resolve, reject);
        }
        
        if (options.type == "whatsapp") {
            return shareWithWhatsapp(options, resolve, reject);
        }

        err("[share] type not valid");        
        return reject("type not valid");
        
	};
    
    return shareProtected;
})();


/**
 * @name Stargate#socialShare
 * @memberof Stargate
 *
 * @description share an url on a social network
 *
 * @param {object} options
 */
stargatePublic.socialShare = function(options) {
    
    if (!isStargateInitialized) {
        return Promise.reject("Stargate not initialized, call Stargate.initialize first!");
    }
    if (!isStargateOpen) {
        return Promise.reject("Stargate closed, wait for Stargate.initialize to complete!");
    }
    
    
    var result = new Promise(function(resolve,reject){
        
        share.socialShare(options, resolve, reject);
    });
    
    
    return result;
};

/**
 * @name Stargate#socialShareAvailable
 * @memberof Stargate
 *
 * @description return a promise with an array of available social networks
 *
 * @param {object} options
 * @param {Array} options.socials - list of social network to check
 * 
 */
stargatePublic.socialShareAvailable = function(options) {
    
    if (!isStargateInitialized) {
        return Promise.reject("Stargate not initialized, call Stargate.initialize first!");
    }
    if (!isStargateOpen) {
        return Promise.reject("Stargate closed, wait for Stargate.initialize to complete!");
    }
    
    if (!window.plugins || !window.plugins.socialsharing) {
        // plugin is not installed
        err("[share] missing cordova plugin");
        return Promise.reject("missing cordova plugin");
    }
    
    if (!options.socials || typeof options.socials !== "object") {
        err("[share] missing object parameter socials");
        return Promise.reject("missing object parameter socials");
    }
    
    if (!options.url) {
        err("[share] missing parameter url");
        return Promise.reject("missing parameter url");
    }
    
    
    var result = new Promise(function(resolve,reject){
        
        var socialsAvailabilityPromises = [];
    
        var knownSocialNetworks = [
            "facebook",
            "whatsapp",
            "twitter",
            "instagram"
        ];
        knownSocialNetworks.forEach(function(element) {
            // check only requested networks
            
            if (options.socials[element]) {
                
                socialsAvailabilityPromises.push(
                    
                    share.canShareVia(element, options.url)
                );
                
            }
        });
        
        Promise.all(socialsAvailabilityPromises).then(function(values) { 
            
            var availableNetworks = {};
            // values is like:
            //  [{"network": "facebook", "available": false},
            //   {"network": "twitter", "available": false}]
            values.forEach(function(element) {
                availableNetworks[element.network] = element.available;
                //log("element: ", element);
            });
            //log("values: ", values);
            //log("availableNetworks: ", availableNetworks);
            resolve(availableNetworks);
            
        }, function(reason) {
            
            err(reason);
            reject(reason);
        });
    });
    
    
    return result;
};

var push = (function(){
    
    var testDevicePushMinutesDelay = 2;
    var testDevicesId = [
        "fc5413366b9d3f40", // dev MC
        "188b6b1d46296303"  // team FR test device
    ];

	var protectedInterface = {};

    var initPromise = null;

    var clickEventFunc = function() {
        // * read url saved
        getSavedUrlDevice()
            .then(function(savedUrl){

                if (connectionStatus && connectionStatus.type && connectionStatus.type === "online") {
                    // * log push clicked event
                    // -> log must be done on webapp when url is loaded
                    // -> this parameter is added to the landing url on webapp: {'source': 'push'}
                    //analytics.track({
                    //    page: savedUrl,
                    //    action: 'PushOpen'
                    //});

                    // * load url in webview
                    log("[push] going to url: ", savedUrl);
                    launchUrl(savedUrl);
                }
                else {
                    //
                    err("[push] i'm offline not going to url");
                }
            })
            .catch(function(error){
                err("[push] error reading url: "+error);
            });
    };

    var pluginExistsFunc = function() {
        return window.cordova && window.cordova.plugins && window.cordova.plugins.notification && window.cordova.plugins.notification.local;
    };

    var eventsBuffer = [];
    var moduleIsReady = false;
    var eventHandlerConnected = false;
    var attachToPluginEvents = function() {
        if (eventHandlerConnected) {
            return;
        }
        if (!pluginExistsFunc()) {
            return;
        }
        eventHandlerConnected = true;
        window.cordova.plugins.notification.local.on("click", function(event){
            // if already initialized process now...
            if (moduleIsReady) {
                clickEventFunc(event);
            }
            // ...else enqueue the event and process after init
            else {
                eventsBuffer.push(event);
            }
        });
    };
    var attachToPluginEventsBeforeDeviceReady = function() {
        if (!window.cordova) {
            return;
        }
        var channel = window.cordova.require('cordova/channel');
        if (channel.onPluginsReady.state === 2) {
            // event already fired
            attachToPluginEvents();
        }
        else {
            // wait for onPluginsReady event
            channel.onPluginsReady.subscribe(function () {
                attachToPluginEvents();
            });
        }
        
    };
    attachToPluginEventsBeforeDeviceReady();

    var fixedLocalPushId = 1;

    //var localStorageDeeplinkName = "stargatePushUrl";

    var getStorageBaseDir = function() {
        var baseDir = window.cordova.file.applicationStorageDirectory;
        if (isRunningOnIos()) {baseDir += "Documents/";}
        return baseDir;
    };
    var getStorageFileName = function() {
        return "SGpushUrl";
    };

    //var getSavedUrl = function() {
    //    return window.localStorage.getItem(localStorageDeeplinkName);
    //};
    //var setSavedUrl = function(url) {
    //    return window.localStorage.setItem(localStorageDeeplinkName, url);
    //};
    var getSavedUrlDevice = function() {
        return stargateModules.file.fileExists(getStorageBaseDir() + getStorageFileName())
            .then(function(exists) {
                if(exists){
                    return stargateModules.file.readFileAsJSON(getStorageBaseDir() + getStorageFileName())
                        .then(function(obj) {
                            return obj.url;
                        });
                }
                return Promise.reject("file not found");
            });
    };
    var setSavedUrlDevice = function(url) {
        // object with url to load after push click
        // getHybridStartUrl => add hybrid parameter to url
        var objToSave = {
            'url': getHybridStartUrl(url, {'source': 'localpush'})
        };
        return stargateModules.file.createFile(getStorageBaseDir(), getStorageFileName())
            .then(function(result){
                log("[push] writing offline data", objToSave, 'in: ',result.path);
                return stargateModules.file.write(result.path, JSON.stringify(objToSave));
            })
            .catch(function(error){
                err("[push] error sg create " + getStorageFileName() + " file", error);
            });
    };

    /**
     * @return boolean - if i need to override timing of 
     */
    var enableTestPushTiming = function() {
        // runningDevice defined on global stargate.js module
        var myDeviceId = runningDevice.uuid;

        if (testDevicesId.indexOf(myDeviceId) > -1) {
            return true;
        }

        return false;
    };

    /**
     * @param {object} initializeConf - configuration sent by
     * @return {boolean} - true if init ok
     */
	protectedInterface.initialize = function() {

        if (!pluginExistsFunc()) {
            return Promise.reject(" not available, missing cordova plugin.");
        }

        if (initPromise !== null) {
            return initPromise;
        }

        initPromise = new Promise(function(resolve){
            
            if (!eventHandlerConnected) {
                // if cordova is injected by manifoldjs handler wont be already attached
                attachToPluginEventsBeforeDeviceReady();
            }

            while (eventsBuffer.length > 0) {
                var event = eventsBuffer.pop();
                log("[push] processing queued event: ", event);
                clickEventFunc(event);
            }

            moduleIsReady = true;
            resolve();
        });

        return initPromise;
    };
    
    protectedInterface.setScheduledNotify = function(params) {
        
        if (initPromise === null) {
            return Promise.reject("Not initialized");
        }

        if (typeof params !== 'object') {
            return Promise.reject("[push] params must be an object");
		}
        
        var reqParams = ["title", "text", "date", "deeplink"];
        for (var i=0; i < reqParams.length; i++) {
            if (!params[reqParams[i]]) {
                return Promise.reject("[push] params."+reqParams[i]+" required!");
            }
        }
        
        // if i must enable push test feature...
        if (enableTestPushTiming()) {
            if (testDevicePushMinutesDelay) {
                war("[push] overriding push schedulation for test device");
                params.date = (new Date().getTime() + (testDevicePushMinutesDelay*60*1000)); 
            }
        }

        var scheduleFunc = function() {
            return setSavedUrlDevice(params.deeplink)
                .then(function() {
                    window.cordova.plugins.notification.local.schedule({
                        id: fixedLocalPushId,
                        title: params.title,
                        text: params.text,
                        at: params.date,
                        icon: "res://icon",
                        smallIcon: "res://ic_notification"
                    });
                    return true;
                });
        };

        // wait for initPromise if it didn't complete
        return initPromise.then(scheduleFunc);
    };

    /**
     * 
     * Check that stargate is properly initialized befor calling the function innerMethod
     */
    var checkDecorator = function(innerMethod) {
        return function () {

            if (!isStargateInitialized) {
                return Promise.reject("Stargate not initialized, call Stargate.initialize first!");
            }
            if (!isStargateOpen) {
                return Promise.reject("Stargate closed, wait for Stargate.initialize to complete!");
            }

            return innerMethod.apply(null, arguments);
        };
    };

    protectedInterface.public = {
        "initialize": checkDecorator(protectedInterface.initialize),
        "setScheduledNotify": checkDecorator(protectedInterface.setScheduledNotify)
    };

    protectedInterface.__clean__ = function() {
        initPromise = null;
    };

    return protectedInterface;
})();

stargatePublic.push = push.public;

/* global URI, URITemplate  */

/**
 * @namespace
 * @protected
 *
 * @description
 * MFP is used to recognize user coming from webapp.
 *
 * For example an usual flow can be:
 *  1. an user open the browser and go to our webapp;
 *  2. then he's suggested to install the app
 *  3. he's sent to the app store and install the app
 *  4. our app with Stargate integrated is opened by our user
 *  5. MFP module send an api request to the server and the user is recongized
 *  6. the previous session is restored by the MobileFingerPrint.setSession
 *
 */
var MFP = (function(){

	// contains private module members
	var MobileFingerPrint = {};

	/**
     * @name MFP#check
     * @memberof MFP
     *
     * @description Start the MFP check to see if user has a session on the server
     * @param {object} initializeConf - configuration sent by
     * @return {boolean} - true if init ok
     *
     */
	MobileFingerPrint.check = function(initializeConf){

		//if (window.localStorage.getItem('mfpCheckDone')){
		//	return;
		//}

		// country defined on main stargate.js
        var neededConfs = ["motime_apikey", "namespace", "label", "country"];
        neededConfs.forEach(function(neededConf) {
            if (!initializeConf.hasOwnProperty(neededConf)) {
                return err("[MFP] Configuration '"+neededConf+"' not defined!");
            }
            if (!initializeConf[neededConf]) {
                return err("[MFP] Configuration: '"+neededConf+"' not valid!");
            }
        });

		MobileFingerPrint.get(initializeConf);
	};

	MobileFingerPrint.getContents = function(country, namespace, label, extData){
		var contents_inapp = {};
	    contents_inapp.api_country = label;
	    contents_inapp.country = country;
	    contents_inapp.fpnamespace = namespace;
	    if (extData){
	        contents_inapp.extData = extData;
	    }

	    var json_data = JSON.stringify(contents_inapp);

	    return json_data;
	};

	MobileFingerPrint.getPonyValue = function(ponyWithEqual) {
		try {
            // if no = present return everything
            if (ponyWithEqual.indexOf("=") === -1) {
                return ponyWithEqual;
            }
			return ponyWithEqual.split('=')[1];
		}
		catch (e) {
			err(e);
		}
		return '';
	};

	MobileFingerPrint.setSession = function(pony, returnUrl){

		// get appurl from configuration or use returnUrl

		var appUrl = stargatePublic.conf.getWebappStartUrl();
        var currentUrl;
        if (returnUrl) {
            // use for domain and protocol the destination url (returnUrl)
            currentUrl = new URI(returnUrl);
        }
        else {
            // if destination url is not requested use appUrl from configuration
            currentUrl = new URI(appUrl);            
        }
		
        if (!returnUrl) {
            returnUrl = appUrl;
        }

		// stargateConf.api.mfpSetUriTemplate:
		// '{protocol}://{hostname}/mfpset.php{?url}&{pony}'
		var hostname = currentUrl.hostname();
		var newUrl = URITemplate(stargateConf.api.mfpSetUriTemplate)
	  		.expand({
	  			"protocol": currentUrl.protocol(),
	  			"hostname": hostname,
	  			"url": returnUrl,
	  			"domain": hostname,
	  			"_PONY": MobileFingerPrint.getPonyValue(pony),
                "hybrid": "1",
                "stargateVersion": getStargateVersionToLoad()
	  	});

		log("[MobileFingerPrint] going to url: ", newUrl);

		launchUrl(newUrl);
	};

	MobileFingerPrint.get = function(initializeConf){
		var expire = "";

	    // stargateConf.api.mfpGetUriTemplate:
	    // "http://domain.com/path.ext{?apikey,contents_inapp,country,expire}",

		var mfpUrl = URITemplate(stargateConf.api.mfpGetUriTemplate)
	  		.expand({
	  			"apikey": initializeConf.motime_apikey,
	  			"contents_inapp": MobileFingerPrint.getContents(initializeConf.country, initializeConf.namespace, initializeConf.label),
	  			"country": initializeConf.country,
	  			"expire": expire
	  	});

        window.aja()
            .url(mfpUrl)
            .type('jsonp')
            .on('success', function(response){

                log("[MobileFingerPrint] get() response: ", response);

                var ponyUrl = '';

                if (response.content.inappInfo){
                    var jsonStruct = JSON.parse(response.content.inappInfo);
                    var appUrl;
                    if (jsonStruct.extData) {
                    	if (jsonStruct.extData.ponyUrl) {
                    		ponyUrl = jsonStruct.extData.ponyUrl;
                    	}
                    	if (jsonStruct.extData.return_url) {
                    		appUrl = jsonStruct.extData.return_url;
                    	}
                    	if (jsonStruct.extData.session_mfp) {

                    		analytics.track({
		                    	page: 'hybrid_initialize',
		                    	action: 'MFP_get',
		                    	session_mfp: jsonStruct.extData.session_mfp
		                    });
                    	}
                    }

                    if (initializeConf.cbOnMfpOkPreSession &&  (typeof initializeConf.cbOnMfpOkPreSession === 'function')) {
                        var cbOnMfpOkPreSession = initializeConf.cbOnMfpOkPreSession;
                        cbOnMfpOkPreSession();
                    }
                    MobileFingerPrint.setSession(ponyUrl, appUrl);
                }else{
                    log("[MobileFingerPrint] get(): Empty session");

                    if (initializeConf.cbOnMfpEmptySession &&  (typeof initializeConf.cbOnMfpEmptySession === 'function')) {
                        var cbOnMfpEmptySession = initializeConf.cbOnMfpEmptySession;
                        cbOnMfpEmptySession();
                    } 
                }
            })
            .on('error', function(error){
                err("[MobileFingerPrint] get() error: ", error);
            })
            .go();
	};


	return {
    setSession: MobileFingerPrint.setSession,
		check: MobileFingerPrint.check
	};

})();

/*
 * JavaScript MD5
 * https://github.com/blueimp/JavaScript-MD5
 *
 * Copyright 2011, Sebastian Tschan
 * https://blueimp.net
 *
 * Licensed under the MIT license:
 * http://www.opensource.org/licenses/MIT
 *
 * Based on
 * A JavaScript implementation of the RSA Data Security, Inc. MD5 Message
 * Digest Algorithm, as defined in RFC 1321.
 * Version 2.2 Copyright (C) Paul Johnston 1999 - 2009
 * Other contributors: Greg Holt, Andrew Kepert, Ydnar, Lostinet
 * Distributed under the BSD License
 * See http://pajhome.org.uk/crypt/md5 for more info.
 */

/*jslint bitwise: true */
/*global unescape, define, module */

var md5 = (function () {
    'use strict';

    /*
    * Add integers, wrapping at 2^32. This uses 16-bit operations internally
    * to work around bugs in some JS interpreters.
    */
    function safe_add(x, y) {
        var lsw = (x & 0xFFFF) + (y & 0xFFFF),
            msw = (x >> 16) + (y >> 16) + (lsw >> 16);
        return (msw << 16) | (lsw & 0xFFFF);
    }

    /*
    * Bitwise rotate a 32-bit number to the left.
    */
    function bit_rol(num, cnt) {
        return (num << cnt) | (num >>> (32 - cnt));
    }

    /*
    * These functions implement the four basic operations the algorithm uses.
    */
    function md5_cmn(q, a, b, x, s, t) {
        return safe_add(bit_rol(safe_add(safe_add(a, q), safe_add(x, t)), s), b);
    }
    function md5_ff(a, b, c, d, x, s, t) {
        return md5_cmn((b & c) | ((~b) & d), a, b, x, s, t);
    }
    function md5_gg(a, b, c, d, x, s, t) {
        return md5_cmn((b & d) | (c & (~d)), a, b, x, s, t);
    }
    function md5_hh(a, b, c, d, x, s, t) {
        return md5_cmn(b ^ c ^ d, a, b, x, s, t);
    }
    function md5_ii(a, b, c, d, x, s, t) {
        return md5_cmn(c ^ (b | (~d)), a, b, x, s, t);
    }

    /*
    * Calculate the MD5 of an array of little-endian words, and a bit length.
    */
    function binl_md5(x, len) {
        /* append padding */
        x[len >> 5] |= 0x80 << (len % 32);
        x[(((len + 64) >>> 9) << 4) + 14] = len;

        var i, olda, oldb, oldc, oldd,
            a =  1732584193,
            b = -271733879,
            c = -1732584194,
            d =  271733878;

        for (i = 0; i < x.length; i += 16) {
            olda = a;
            oldb = b;
            oldc = c;
            oldd = d;

            a = md5_ff(a, b, c, d, x[i],       7, -680876936);
            d = md5_ff(d, a, b, c, x[i +  1], 12, -389564586);
            c = md5_ff(c, d, a, b, x[i +  2], 17,  606105819);
            b = md5_ff(b, c, d, a, x[i +  3], 22, -1044525330);
            a = md5_ff(a, b, c, d, x[i +  4],  7, -176418897);
            d = md5_ff(d, a, b, c, x[i +  5], 12,  1200080426);
            c = md5_ff(c, d, a, b, x[i +  6], 17, -1473231341);
            b = md5_ff(b, c, d, a, x[i +  7], 22, -45705983);
            a = md5_ff(a, b, c, d, x[i +  8],  7,  1770035416);
            d = md5_ff(d, a, b, c, x[i +  9], 12, -1958414417);
            c = md5_ff(c, d, a, b, x[i + 10], 17, -42063);
            b = md5_ff(b, c, d, a, x[i + 11], 22, -1990404162);
            a = md5_ff(a, b, c, d, x[i + 12],  7,  1804603682);
            d = md5_ff(d, a, b, c, x[i + 13], 12, -40341101);
            c = md5_ff(c, d, a, b, x[i + 14], 17, -1502002290);
            b = md5_ff(b, c, d, a, x[i + 15], 22,  1236535329);

            a = md5_gg(a, b, c, d, x[i +  1],  5, -165796510);
            d = md5_gg(d, a, b, c, x[i +  6],  9, -1069501632);
            c = md5_gg(c, d, a, b, x[i + 11], 14,  643717713);
            b = md5_gg(b, c, d, a, x[i],      20, -373897302);
            a = md5_gg(a, b, c, d, x[i +  5],  5, -701558691);
            d = md5_gg(d, a, b, c, x[i + 10],  9,  38016083);
            c = md5_gg(c, d, a, b, x[i + 15], 14, -660478335);
            b = md5_gg(b, c, d, a, x[i +  4], 20, -405537848);
            a = md5_gg(a, b, c, d, x[i +  9],  5,  568446438);
            d = md5_gg(d, a, b, c, x[i + 14],  9, -1019803690);
            c = md5_gg(c, d, a, b, x[i +  3], 14, -187363961);
            b = md5_gg(b, c, d, a, x[i +  8], 20,  1163531501);
            a = md5_gg(a, b, c, d, x[i + 13],  5, -1444681467);
            d = md5_gg(d, a, b, c, x[i +  2],  9, -51403784);
            c = md5_gg(c, d, a, b, x[i +  7], 14,  1735328473);
            b = md5_gg(b, c, d, a, x[i + 12], 20, -1926607734);

            a = md5_hh(a, b, c, d, x[i +  5],  4, -378558);
            d = md5_hh(d, a, b, c, x[i +  8], 11, -2022574463);
            c = md5_hh(c, d, a, b, x[i + 11], 16,  1839030562);
            b = md5_hh(b, c, d, a, x[i + 14], 23, -35309556);
            a = md5_hh(a, b, c, d, x[i +  1],  4, -1530992060);
            d = md5_hh(d, a, b, c, x[i +  4], 11,  1272893353);
            c = md5_hh(c, d, a, b, x[i +  7], 16, -155497632);
            b = md5_hh(b, c, d, a, x[i + 10], 23, -1094730640);
            a = md5_hh(a, b, c, d, x[i + 13],  4,  681279174);
            d = md5_hh(d, a, b, c, x[i],      11, -358537222);
            c = md5_hh(c, d, a, b, x[i +  3], 16, -722521979);
            b = md5_hh(b, c, d, a, x[i +  6], 23,  76029189);
            a = md5_hh(a, b, c, d, x[i +  9],  4, -640364487);
            d = md5_hh(d, a, b, c, x[i + 12], 11, -421815835);
            c = md5_hh(c, d, a, b, x[i + 15], 16,  530742520);
            b = md5_hh(b, c, d, a, x[i +  2], 23, -995338651);

            a = md5_ii(a, b, c, d, x[i],       6, -198630844);
            d = md5_ii(d, a, b, c, x[i +  7], 10,  1126891415);
            c = md5_ii(c, d, a, b, x[i + 14], 15, -1416354905);
            b = md5_ii(b, c, d, a, x[i +  5], 21, -57434055);
            a = md5_ii(a, b, c, d, x[i + 12],  6,  1700485571);
            d = md5_ii(d, a, b, c, x[i +  3], 10, -1894986606);
            c = md5_ii(c, d, a, b, x[i + 10], 15, -1051523);
            b = md5_ii(b, c, d, a, x[i +  1], 21, -2054922799);
            a = md5_ii(a, b, c, d, x[i +  8],  6,  1873313359);
            d = md5_ii(d, a, b, c, x[i + 15], 10, -30611744);
            c = md5_ii(c, d, a, b, x[i +  6], 15, -1560198380);
            b = md5_ii(b, c, d, a, x[i + 13], 21,  1309151649);
            a = md5_ii(a, b, c, d, x[i +  4],  6, -145523070);
            d = md5_ii(d, a, b, c, x[i + 11], 10, -1120210379);
            c = md5_ii(c, d, a, b, x[i +  2], 15,  718787259);
            b = md5_ii(b, c, d, a, x[i +  9], 21, -343485551);

            a = safe_add(a, olda);
            b = safe_add(b, oldb);
            c = safe_add(c, oldc);
            d = safe_add(d, oldd);
        }
        return [a, b, c, d];
    }

    /*
    * Convert an array of little-endian words to a string
    */
    function binl2rstr(input) {
        var i,
            output = '';
        for (i = 0; i < input.length * 32; i += 8) {
            output += String.fromCharCode((input[i >> 5] >>> (i % 32)) & 0xFF);
        }
        return output;
    }

    /*
    * Convert a raw string to an array of little-endian words
    * Characters >255 have their high-byte silently ignored.
    */
    function rstr2binl(input) {
        var i,
            output = [];
        output[(input.length >> 2) - 1] = undefined;
        for (i = 0; i < output.length; i += 1) {
            output[i] = 0;
        }
        for (i = 0; i < input.length * 8; i += 8) {
            output[i >> 5] |= (input.charCodeAt(i / 8) & 0xFF) << (i % 32);
        }
        return output;
    }

    /*
    * Calculate the MD5 of a raw string
    */
    function rstr_md5(s) {
        return binl2rstr(binl_md5(rstr2binl(s), s.length * 8));
    }

    /*
    * Calculate the HMAC-MD5, of a key and some data (raw strings)
    */
    function rstr_hmac_md5(key, data) {
        var i,
            bkey = rstr2binl(key),
            ipad = [],
            opad = [],
            hash;
        ipad[15] = opad[15] = undefined;
        if (bkey.length > 16) {
            bkey = binl_md5(bkey, key.length * 8);
        }
        for (i = 0; i < 16; i += 1) {
            ipad[i] = bkey[i] ^ 0x36363636;
            opad[i] = bkey[i] ^ 0x5C5C5C5C;
        }
        hash = binl_md5(ipad.concat(rstr2binl(data)), 512 + data.length * 8);
        return binl2rstr(binl_md5(opad.concat(hash), 512 + 128));
    }

    /*
    * Convert a raw string to a hex string
    */
    function rstr2hex(input) {
        var hex_tab = '0123456789abcdef',
            output = '',
            x,
            i;
        for (i = 0; i < input.length; i += 1) {
            x = input.charCodeAt(i);
            output += hex_tab.charAt((x >>> 4) & 0x0F) +
                hex_tab.charAt(x & 0x0F);
        }
        return output;
    }

    /*
    * Encode a string as utf-8
    */
    function str2rstr_utf8(input) {
        return unescape(encodeURIComponent(input));
    }

    /*
    * Take string arguments and return either raw or hex encoded strings
    */
    function raw_md5(s) {
        return rstr_md5(str2rstr_utf8(s));
    }
    function hex_md5(s) {
        return rstr2hex(raw_md5(s));
    }
    function raw_hmac_md5(k, d) {
        return rstr_hmac_md5(str2rstr_utf8(k), str2rstr_utf8(d));
    }
    function hex_hmac_md5(k, d) {
        return rstr2hex(raw_hmac_md5(k, d));
    }

    function md5(string, key, raw) {
        if (!key) {
            if (!raw) {
                return hex_md5(string);
            }
            return raw_md5(string);
        }
        if (!raw) {
            return hex_hmac_md5(key, string);
        }
        return raw_hmac_md5(key, string);
    }

    return md5;
}());




var startLoading = function(properties) {
	if (typeof window.SpinnerDialog === "undefined") {
        return err("startLoading(): SpinnerDialog cordova plugin missing!");
    }
    
    if (typeof properties !== 'object') {
		properties = {};
	}
	
    var msg = null;
    
    if(properties.hasOwnProperty("message")){
        msg = properties.message;
    }
    window.SpinnerDialog.show(null, msg);
    return true;
};

var stopLoading = function() {
	if (typeof window.SpinnerDialog === "undefined") {
        return err("startLoading(): SpinnerDialog cordova plugin missing!");
    }
    
    window.SpinnerDialog.hide();
    return true;
};

//jshint unused:false
var changeLoadingMessage = function(newMessage) {
    if (typeof window.SpinnerDialog === "undefined") {
        return err("startLoading(): SpinnerDialog cordova plugin missing!");
    }
    
    window.SpinnerDialog.show(null, newMessage);
    return true;
};


// FIXME: used inside store.js
window.startLoading = startLoading;
window.stopLoading = stopLoading;



stargatePublic.inAppPurchaseSubscription = function(callbackSuccess, callbackError, subscriptionUrl, returnUrl) {

    if (!isStargateInitialized) {
        callbackError("Stargate not initialized, call Stargate.initialize first!");
        return false;
    }
    if (!isStargateOpen) {
        callbackError("Stargate closed, wait for Stargate.initialize to complete!");
        return false;
    }
    
    setBusy(true);

    if (typeof returnUrl !==  'undefined'){
        IAP.returnUrl = returnUrl;
    }
    if (typeof subscriptionUrl !==  'undefined'){
        IAP.subscribeMethod = subscriptionUrl;
    }
    
    IAP.callbackSuccess = callbackSuccess;
    IAP.callbackError = callbackError;
    
    /*
    if (isRunningOnAndroid() && appIsDebug) {
        var debugTransactionAndroid = {
            "id":IAP.id,
            "alias":"Stargate Debug IAP Mock",
            "type":"paid subscription",
            "state":"owned",
            "title":"Stargate Debug IAP Mock subscription",
            "description":"Stargate Debug IAP Mock subscription",
            "price":"€2.00",
            "currency":"EUR",
            "loaded":true,
            "canPurchase":false,
            "owned":true,
            "downloading":false,
            "downloaded":false,
            "transaction":{
                "type":"android-playstore",
                "purchaseToken":"dgdecoeeoodhalncipabhmnn.AO-J1OwM_emD6KWnZBjTCG2nTF5XWvuHzLCOBPIBj9liMlqzftcDamRFnUvEasQ1neEGK7KIxlPKMV2W09T4qAVZhw_aGbPylo-5a8HVYvJGacoj9vXbvKhb495IMIq8fmywk8-Q7H5jL_0lbfSt9SMVM5V6k3Ttew",
                "receipt":"{\"packageName\":\"stargate.test.package.id\",\"productId\":\"stargate.mock.subscription.weekly\",\"purchaseTime\":1460126549804,\"purchaseState\":0,\"purchaseToken\":\"dgdecoeeoodhalncipabhmnn.AO-J1OwM_emD6KWnZBjTCG2nTF5XWvuHzLCOBPIBj9liMlqzftcDamRFnUvEasQ1neEGK7KIxlPKMV2W09T4qAVZhw_aGbPylo-5a8HVYvJGacoj9vXbvKhb495IMIq8fmywk8-Q7H5jL_0lbfSt9SMVM5V6k3Ttew\",\"autoRenewing\":false}","signature":"UciGXv48EMVdUXICxoy+hBWTiKbn4VABteQeIUVlFG0GmJ/9p/k372RhPyprqve7tnwhk+vpZYos5Fwvm/SrYjsqKMMFgTzotrePwJ9spq2hzmjhkqNTKkxdcgiuaCp8Vt7vVH9yjCtSKWwdS1UBlZLPaJunA4D2KE8TP/qYnwgZTOCBvSf3rUbEzmwRuRbYqndNyoMfIXvRP71TDBsMcHM/3UrDYEf2k2/SJKnctcGmvU2/BW/WG96T9FuiJPpotax7iQmBdN5PmfuxlZiZiUyj9mFEgzPEIAMP2HCcdX2KlNBPhKhxm4vESozVljTbrI0+OGJjQJhaWBn9+aclmA=="
            },
            "valid":true
        };
        IAP.onProductOwned(debugTransactionAndroid);
        return true;
    }
    */

    IAP.inappPurchaseCalled = true;
    
    // execute createUser if data is already available
    if (IAP.lastCreateUserProduct && IAP.lastCreateUserToken) {
        IAP.createUser(IAP.lastCreateUserProduct, IAP.lastCreateUserToken);
        
        // no need to call refresh again
        return true;
    }
    
    IAP.doRefresh();
    window.store.order(IAP.id);
    return true;
};


stargatePublic.inAppRestore = function(callbackSuccess, callbackError, subscriptionUrl, returnUrl) {

    if (!isStargateInitialized) {
        return callbackError("Stargate not initialized, call Stargate.initialize first!");
    }
    if (!isStargateOpen) {
        return callbackError("Stargate closed, wait for Stargate.initialize to complete!");
    }

    // no set busy needed for restore as it's usually fast and 
    //  we cannot intercept error result, so the loader remain visible

    if (typeof subscriptionUrl !==  'undefined'){
        IAP.subscribeMethod = subscriptionUrl;
    }
    if (typeof returnUrl !==  'undefined'){
        IAP.returnUrl = returnUrl;
    }
    
    IAP.callbackSuccess = callbackSuccess;
    IAP.callbackError = callbackError;
    IAP.inappPurchaseCalled = true;
    
    IAP.doRefresh(true);
};

/**
 * Return information about a product got from store
 * 
 * @param {object} options - options object
 * @param {string} [options.productId=IAP.id] - product id about to query for information on store
 * @param {string} options.subscriptionUrl - api endpoint that will be called when IAP is completed @see createUser method
 * @param {function} options.callbackListingSuccess=function(){} - a function that will be called when information are ready
 * @param {function} options.callbackPurchaseSuccess=function(){} - a function that will be called when createUser complete (if the product is already owned)
 * @param {function} options.callbackError=function(){} - a function that will be called if an error occur 
 * 
 * @returns {boolean} - request result: true OK, false KO
 * */
stargatePublic.inAppProductInfo = function(options) {

    if (! options.productId) {
        options.productId = IAP.id;
    }
    
    if (typeof(options.callbackListingSuccess) !== "function") {
        options.callbackListingSuccess = function() {};
    }
    if (typeof(options.callbackPurchaseSuccess) !== "function") {
        options.callbackPurchaseSuccess = function() {};
    }
    if (typeof(options.callbackError) !== "function") {
        options.callbackError = function() {};
    }
    if (!options.subscriptionUrl) {
        err("[IAP] inAppProductInfo(): options.subscriptionUrl invalid");
        return false;
    }
    
    if (!isStargateInitialized) {
        options.callbackError("Stargate not initialized, call Stargate.initialize first!");
        return false;
    }
    if (!isStargateOpen) {
        options.callbackError("Stargate closed, wait for Stargate.initialize to complete!");
        return false;
    }
    
    IAP.subscribeMethod = options.subscriptionUrl;
    
    IAP.requestedListingProductId = options.productId;
    IAP.callbackListingSuccess = options.callbackListingSuccess;
    IAP.callbackPurchaseSuccess = options.callbackPurchaseSuccess;
    IAP.callbackListingError = options.callbackError;
    IAP.inappProductInfoCalled = true;

    // execute callback for product information if data is already available 
    if (IAP.productsInfo[options.productId]) {
        try {
            IAP.callbackListingSuccess(IAP.productsInfo[options.productId]);
        }
        catch (error) {
            err("[IAP] inAppProductInfo(): error on callbackListingSuccess!");
        }
    }
    
    // execute createUser if data is already available
    if (IAP.lastCreateUserProduct && IAP.lastCreateUserToken) {
        IAP.createUser(IAP.lastCreateUserProduct, IAP.lastCreateUserToken);
        
        // no need to call refresh again
        return true;
    }
    
    // call refresh then, when store will call stargate, we will call client callbacks
    IAP.doRefresh(true);    
    return true;    
};

var iaplight = (function(){
    
	var protectedInterface = {};

    /*
     * inAppPurchase.getProducts(["com.mycompany.myproduct.weekly.v1"]).then(function(res){console.log("res:"+JSON.stringify(res))})
     * res:[
     *     {
     *         "productId": "com.mycompany.myproduct.weekly.v1",
     *         "title": "Abbonamento Premium CalcioStar Italia",
     *         "description": "Abonamento premium al catalogo CalcioStar Italia",
     *         "price": "€0,99"
     *     }
     * ]
     * 
     * inAppPurchase.subscribe("com.mycompany.myproduct.weekly.v1").then(function(res){console.log("res:"+JSON.stringify(res))}).catch(function(err){console.error(err)})
     * res:{
     *     "transactionId":"1000000221696692",
     *     "receipt":"MXXXX"
     * }
     * 
     * inAppPurchase.getReceiptBundle().then(function(res){console.log("res:"+JSON.stringify(res))})
     * res:{
     *     "originalAppVersion": "1.0",
     *     "appVersion": "0.1.0",
     *     "inAppPurchases": [
     *         {
     *             "transactionIdentifier":"1000000221696692",
     *             "quantity":1,
     *             "purchaseDate":"2016-07-05T10:15:21Z",
     *             "productId":"com.mycompany.myproduct.weekly.v1",
     *             "originalPurchaseDate":"2016-07-05T10:15:22Z",
     *             "subscriptionExpirationDate":"2016-07-05T10:18:21Z",
     *             "originalTransactionIdentifier":"1000000221696692",
     *             "webOrderLineItemID":-1497665198,
     *             "cancellationDate":null}
     *     ],
     *     "bundleIdentifier": "com.mycompany.myproduct"
     * }
    */

    /**
     * 
     * Initialization promise generated from window.inAppPurchase.getProducts
     * all public interface wait for this promise to resolve
     * 
     */
    var initPromise = null;
    

    /**
     * Array of in app products id requested by webapp
     */
    var productsId = [];

    /**
     * Array of in app product information, like this: 
     * [{
     *   "productId": "com.mycompany.myproduct.weekly.v1",
     *   "title": "Premium subscription to myproduct",
     *   "description": "Premium subscription to my beatiful product",
     *   "price": "€0,99"
     * }]
     */
    var productsInfo = [];

    /**
     * @param {object} initializeConf - configuration sent by
     * @return {boolean} - true if init ok
     */
	protectedInterface.initialize = function(initializeConf) {

        if (!window.inAppPurchase) {
            return Promise.reject("inAppPurchase not available, missing cordova plugin.");
        }

        if (initPromise !== null) {
            return initPromise;
        }

        if (initializeConf.productsIdAndroid || initializeConf.productsIdIos) {
            if (isRunningOnAndroid()) {
                productsId = initializeConf.productsIdAndroid;
            }
            else if (isRunningOnIos()) {
                productsId = initializeConf.productsIdIos;
            }
        }

        if (!productsId) {
            return Promise.reject("missing parameter productsId(Android|Ios)");
        }
        if (productsId && productsId.constructor !== Array) {
            return Promise.reject("parameter error, productsId(Android|Ios) must be an array");
        }
        if (productsId.length === 0) {
            return Promise.reject("parameter error, productsId(Android|Ios) must contains at least a productid");
        }
        

        initPromise = window.inAppPurchase.getProducts(productsId)
            .then(function(res){
                productsInfo = res;
                log("[IAPlight] getProducts ok", res);
                return res;
            })
            .catch(function(error) {
                err("[IAPlight] getProducts KO", error);
            });

        return initPromise;
    };

    protectedInterface.subscribe = function(productId) {
        
        if (initPromise === null) {
            return Promise.reject("Not initialized");
        }

        var subFunc = function() {
            return window.inAppPurchase.subscribe(
                productId
            )
            .then(function(res){
                log("[IAPlight] subscribe ok", res);

                if (isRunningOnIos()) {
                    return protectedInterface.getActiveSubscriptionsInfo()
                    .then(function(resIos){
                        log("resIos:"+JSON.stringify(resIos));
                        if (!(productId in resIos)) {
                            throw new Error("Subscription information incomplete!"+productId);
                        }
                        var subscriptionInfo = resIos[productId];
                        var resultSusbscriptionIos = {
                            productId: subscriptionInfo.productId,
                            transactionId: subscriptionInfo.transactionIdentifier,
                            purchaseDate: subscriptionInfo.purchaseDate,
                            purchaseTime: (+(new Date(subscriptionInfo.purchaseDate).getTime()) / 1000).toFixed(0)
                        };
                        return resultSusbscriptionIos;
                    });
                }

                // {"signature":"EjwaorJ8D5yD9F7t7yQgRvHBjk+Ga53seIilDuzzLmv05cc0LiV/WAqUE+NHq+CGTnogtxnb/rjSAxo+K2S6xg8kskZQvRzYNxo0YBhvhCRr5VKrvQO+VZTwM3RKfNlDGdCYw7rEuuvcvH733wzPGdeKmLKw4JI7wk6ViVMEgq7ub7dOTwiv8rSVqf/2sIbD96yhh3d55jWiBdbwCzLvaVcLKTAD6oG78bW7n9FbTAcdDEMxAeNEDJw90fANA/MXvvO1tp6rcFy/emqDCZcinv+zal5rQQc7M372YW6iBqWWm+zemexH6DrVsdjdGEsI6X1Rmk8Y8M1bnwnYKCACaA==",
                //  "productId":"pt.getstyle.weekly.v1",
                //  "transactionId":"gjmkkfbapgplpdallcgpbaol.AO-J1OxwQeGM0H3ru88F1BVqSYtUT-4VsS3U9a0tlWomLk7kvvpNQoMlAVX3_mZ2aiu5X50luuLSeO31QxwwldN9jczTU_H6UMkD1tq1hLILWE1-nAkq9VrOpoW0Jz4rbQnUwZHb_wwZ",
                //  "type":"subs",
                //  "productType":"subs",
                //  "receipt":"{\"packageName\":\"pt.getstyle\",
                //              \"productId\":\"pt.getstyle.weekly.v1\",
                //              \"purchaseTime\":1490946081110,
                //              \"purchaseState\":0,
                //              \"purchaseToken\":\"gjmkkfbapgplpdallcgpbaol.AO-J1OxwQeGM0H3ru88F1BVqSYtUT-4VsS3U9a0tlWomLk7kvvpNQoMlAVX3_mZ2aiu5X50luuLSeO31QxwwldN9jczTU_H6UMkD1tq1hLILWE1-nAkq9VrOpoW0Jz4rbQnUwZHb_wwZ\",
                //              \"autoRenewing\":true
                //            }"
                //  }
                if (isRunningOnAndroid()) {
                    var parsedReceipt =  JSON.parse(res.receipt);
                    
                    return Promise.resolve(
                        {
                            productId: parsedReceipt.productId,
                            transactionId: res.transactionId,
                            purchaseDate: (new Date(parsedReceipt.purchaseTime*1000)).toISOString(),
                            purchaseTime: parsedReceipt.purchaseTime+"",
                        }
                    );
                }

                err("[IAPlight] subscribe() unsupported platform!");
                return Promise.reject("Unsupported platform!");
            })
            .catch(function(error){
                err("[IAPlight] subscribe KO: "+error, error);
                throw error;
            });
        };

        // wait for initPromise if it didn't complete
        return initPromise.then(subFunc);
    };

    protectedInterface.subscribeReceipt = function(productId) {
        
        if (initPromise === null) {
            return Promise.reject("Not initialized");
        }

        var subFunc = function() {
            return window.inAppPurchase.subscribe(
                productId
            )
            .then(function(res){
                log("[IAPlight] subscribeReceipt ok", res);

                return res;
            })
            .catch(function(error){
                err("[IAPlight] subscribe KO: "+error, error);
                throw error;
            });
        };

        // wait for initPromise if it didn't complete
        return initPromise.then(subFunc);
    };

    protectedInterface.getExpireDate = function(productId) {
        
        if (initPromise === null) {
            return Promise.reject("Not initialized");
        }

        var receiptFunc = function() {
            return window.inAppPurchase.getReceiptBundle()
            .then(function(res){
                // return last purchase receipt (ordered by last subscriptionExpirationDate)

                log("[IAPlight] getExpireDate getReceiptBundle ok", res);

                /* res:{ "originalAppVersion": "1.0",
                *        "appVersion": "0.1.0",
                *        "inAppPurchases": [ {
                *                "transactionIdentifier":"123412341234",
                *                "quantity":1,
                *                "purchaseDate":"2016-07-05T10:15:21Z",
                *                "productId":"com.mycompany.myapp.weekly.v1",
                *                "originalPurchaseDate":"2016-07-05T10:15:22Z",
                *                "subscriptionExpirationDate":"2016-07-05T10:18:21Z",
                *                "originalTransactionIdentifier":"123412341234",
                *                "webOrderLineItemID":-1497665198,
                *                "cancellationDate":null}
                *        ],
                *        "bundleIdentifier": "com.mycompany.myapp" }
                */
                var lastPurchase = {};
                if (res.inAppPurchases && res.inAppPurchases.constructor === Array) {
                    res.inAppPurchases.forEach(function(inAppPurchase) {
                        
                        // filter out other productIds
                        if (inAppPurchase.productId == productId) {

                            // if 
                            if (!lastPurchase.subscriptionExpirationDate) {
                                lastPurchase = inAppPurchase;
                                return;
                            }

                            var lastExp = new Date(lastPurchase.subscriptionExpirationDate);
                            var currExp = new Date(inAppPurchase.subscriptionExpirationDate);

                            if (lastExp < currExp) {
                                lastPurchase = inAppPurchase;
                                return;
                            }
                        }
                    });
                }

                return lastPurchase;
            })
            .then(function(lastPurchase) {
                // return expiration date

                if (!lastPurchase.subscriptionExpirationDate) {
                    return null;
                }
                log("[IAPlight] getExpireDate lastPurchase ok", lastPurchase);

                var dt = new Date(lastPurchase.subscriptionExpirationDate);
                if ( Object.prototype.toString.call(dt) === "[object Date]" ) {
                    // it is a date
                    if ( isNaN( dt.getTime() ) ) {
                        return null;
                    }
                }
                else {
                    err("[IAPlight] getReceiptBundle invalid date: "+lastPurchase.subscriptionExpirationDate+" Date.toString:"+dt);
                    return null;
                }
                return dt;
            })
            .catch(function(error){
                err("[IAPlight] getReceiptBundle KO: "+error, error);
                throw error;
            });
        };

        // wait for initPromise if it didn't complete
        return initPromise.then(receiptFunc);
    };

    protectedInterface.isSubscribed = function(productId) {
        
        if (initPromise === null) {
            return Promise.reject("Not initialized");
        }

        var isSubscribedFunc = function() {
            return protectedInterface.getActiveSubscriptionsInfo()
            .then(function(activeSubscriptions){

                return (activeSubscriptions[productId]) ? true : false;
            });
        };

        // wait for initPromise if it didn't complete
        return initPromise.then(isSubscribedFunc);
    };

    protectedInterface.restore = function() {
        
        if (initPromise === null) {
            return Promise.reject("Not initialized");
        }

        var restoreFunc = function() {
            return window.inAppPurchase.restorePurchases()
            .then(function(resultRestore){
                // resolves to an array of objects with the following attributes:
                //   productId
                //   state - the state of the product. On Android the statuses are: 0 - ACTIVE, 1 - CANCELLED, 2 - REFUNDED
                //   transactionId
                //   date - timestamp of the purchase
                //   productType - On Android it can be used to consume a purchase. On iOS it will be an empty string.
                //   receipt - On Android it can be used to consume a purchase. On iOS it will be an empty string.
                //   signature - On Android it can be used to consume a purchase. On iOS it will be an empty string.


                log("[IAPlight] restore restorePurchases ok", resultRestore);

                /* resultRestore: [
                        {"productId":"com.mycompany.myproduct.weekly.v1","date":"2016-07-05T10:27:21Z","transactionId":"1000000222595453","state":3},
                        {"productId":"com.mycompany.myproduct.weekly.v1","date":"2016-07-05T10:21:21Z","transactionId":"1000000222595454","state":3},
                        {"productId":"com.mycompany.myproduct.weekly.v1","date":"2016-07-08T11:10:50Z","transactionId":"1000000222595466","state":3}
                    ]
                */

                return protectedInterface.getActiveSubscriptionsInfo()
                .then(function(activeSubscriptions){
                    if (Object.keys(activeSubscriptions).length === 0) {
                        return false;
                    }
                    return activeSubscriptions;
                });
            })
            .catch(function(error){
                err("[IAPlight] restore restorePurchases KO: "+error, error);
                throw error;
            });
        };

        // wait for initPromise if it didn't complete
        return initPromise.then(restoreFunc);
    };

    protectedInterface.getProductInfo = function(productId) {
        
        if (initPromise === null) {
            return Promise.reject("Not initialized");
        }

        // wait for initPromise if it didn't complete
        return initPromise.then(function(){

            var rightProductInfo = {};

            productsInfo.forEach(function(productInfo) {
                if (productInfo.productId == productId) {
                    rightProductInfo = productInfo;
                }
            });
            log("[IAPlight] getProductInfo(): product found:", rightProductInfo);

            return rightProductInfo;
        });
    };

    /**
     * Check the validity and expiration of a date string
     * @param {String} date date in string to check validity of
     * @return {Boolean} validity of date string
     */
    var isValidDateAndNotExpired = function(dateString) {
        var dateDate = new Date(dateString);
        // it is a date... ?
        if ( Object.prototype.toString.call(dateDate) === "[object Date]" ) {
            if ( isNaN( dateDate.getTime() ) ) {
                // ...no!
                return false;
            }
        }
        else {
            // ...no!
            err("[IAPlight] isValidDateAndNotExpired() invalid date: "+dateString+" Date.toString:"+dateDate);
            return false;
        }
        // ...yes!!

        // ... and not expired ...
        return ((dateDate !== null) && (new Date() < dateDate));
    };

    protectedInterface.getActiveSubscriptionsInfo = function() {
        
        if (initPromise === null) {
            return Promise.reject("Not initialized");
        }

        var activeSubscriptionsInfoFunc = function() {
            if (isRunningOnAndroid()) {

                return window.inAppPurchase.restorePurchases()
                .then(function(resultsRestore){

                    var activeSubscriptionInfo = {};
                    
                    //[
                    //    {
                    //        "productId":"pt.getstyle.weekly.v1",
                    //        "transactionId":"",
                    //        "type":"subs",
                    //        "productType":"subs",
                    //        "signature":"EjwaorJ8D5yD9F7t7yQgRvHBjk+Ga53seIilDuzzLmv05cc0LiV/WAqUE+NHq+CGTnogtxnb/rjSAxo+K2S6xg8kskZQvRzYNxo0YBhvhCRr5VKrvQO+VZTwM3RKfNlDGdCYw7rEuuvcvH733wzPGdeKmLKw4JI7wk6ViVMEgq7ub7dOTwiv8rSVqf/2sIbD96yhh3d55jWiBdbwCzLvaVcLKTAD6oG78bW7n9FbTAcdDEMxAeNEDJw90fANA/MXvvO1tp6rcFy/emqDCZcinv+zal5rQQc7M372YW6iBqWWm+zemexH6DrVsdjdGEsI6X1Rmk8Y8M1bnwnYKCACaA==",
                    //        "receipt": "{ \"packageName\":\"pt.getstyle\",
                    //                      \"productId\":\"pt.getstyle.weekly.v1\",
                    //                      \"purchaseTime\":1490946081110,
                    //                      \"purchaseState\":0,
                    //                      \"purchaseToken\":\"gjmkkfbapgplpdallcgpbaol.AO-J1OxwQeGM0H3ru88F1BVqSYtUT-4VsS3U9a0tlWomLk7kvvpNQoMlAVX3_mZ2aiu5X50luuLSeO31QxwwldN9jczTU_H6UMkD1tq1hLILWE1-nAkq9VrOpoW0Jz4rbQnUwZHb_wwZ\",
                    //                      \"autoRenewing\":true
                    //                  }"
                    //    }
                    //]

                    if (resultsRestore && resultsRestore.constructor === Array) {
                        resultsRestore.forEach(function(resultRestore) {
                                
                            var parsedReceipt =  JSON.parse(resultRestore.receipt);
                            if ((parsedReceipt.packageName == appPackageName) &&
                                (parsedReceipt.purchaseState === 0)) {
                                
                                activeSubscriptionInfo[resultRestore.productId] = parsedReceipt;
                            }
                        });
                    }
                    return activeSubscriptionInfo;
                });

            } else if (isRunningOnIos()) {
                
                return window.inAppPurchase.getReceiptBundle()
                .then(function(res){
                    // get last purchase receipt (ordered by last subscriptionExpirationDate) for each active product

                    var activeSubscriptionInfo = {};

                    log("[IAPlight] getActiveSubscriptionsInfo getReceiptBundle ok", res);

                    /* res:{ "originalAppVersion": "1.0",
                    *        "appVersion": "0.1.0",
                    *        "inAppPurchases": [ {
                    *                "transactionIdentifier":"123412341234",
                    *                "quantity":1,
                    *                "purchaseDate":"2016-07-05T10:15:21Z",
                    *                "productId":"com.mycompany.myapp.weekly.v1",
                    *                "originalPurchaseDate":"2016-07-05T10:15:22Z",
                    *                "subscriptionExpirationDate":"2016-07-05T10:18:21Z",
                    *                "originalTransactionIdentifier":"123412341234",
                    *                "webOrderLineItemID":-1497665198,
                    *                "cancellationDate":null}
                    *        ],
                    *        "bundleIdentifier": "com.mycompany.myapp" }
                    */
                    if (res.inAppPurchases && res.inAppPurchases.constructor === Array) {

                        res.inAppPurchases.forEach(function(inAppPurchase) {
                            
                            // continue only if subscriptionExpirationDate is valid...
                            if (isValidDateAndNotExpired(inAppPurchase.subscriptionExpirationDate)) {

                                // if not existent ...
                                if (!(inAppPurchase.productId in activeSubscriptionInfo)) {
                                    
                                    // ... save it
                                    activeSubscriptionInfo[inAppPurchase.productId] = inAppPurchase;
                                    return;
                                }

                                // if expire later...
                                var lastExp = new Date(activeSubscriptionInfo[inAppPurchase.productId].subscriptionExpirationDate);
                                var currExp = new Date(inAppPurchase.subscriptionExpirationDate);

                                if (lastExp < currExp) {
                                    // ... save it
                                    activeSubscriptionInfo[inAppPurchase.productId] = inAppPurchase;
                                    return;
                                }
                            }
                        });
                    }

                    return activeSubscriptionInfo;
                })
                .catch(function(error){
                    err("[IAPlight] getReceiptBundle KO: "+error, error);
                    throw error;
                });

            } else {
                return Promise.reject("Unsupported platform!");
            }
        };

        // wait for initPromise if it didn't complete
        return initPromise.then(activeSubscriptionsInfoFunc);
    };

    /**
     * 
     * Check that stargate is properly initialized befor calling the function innerMethod
     */
    var checkDecorator = function(innerMethod) {
        return function () {

            if (!isStargateInitialized) {
                return Promise.reject("Stargate not initialized, call Stargate.initialize first!");
            }
            if (!isStargateOpen) {
                return Promise.reject("Stargate closed, wait for Stargate.initialize to complete!");
            }

            return innerMethod.apply(null, arguments);
        };
    };

    protectedInterface.public = {
        "initialize": checkDecorator(protectedInterface.initialize),
        "restore": checkDecorator(protectedInterface.restore),
        "getProductInfo": checkDecorator(protectedInterface.getProductInfo),
        "subscribe": checkDecorator(protectedInterface.subscribe),
        "subscribeReceipt": checkDecorator(protectedInterface.subscribeReceipt),
        "isSubscribed": checkDecorator(protectedInterface.isSubscribed),
        "getActiveSubscriptionsInfo": checkDecorator(protectedInterface.getActiveSubscriptionsInfo)
        
    };

    protectedInterface.__clean__ = function() {
        initPromise = null;
    };

    return protectedInterface;
})();

stargatePublic.iaplight = iaplight.public;


var IAP = {

	id: '',
	alias: '',
	type: '',
	verbosity: '',
	paymethod: '',
    subscribeMethod: '',
    returnUrl: '',
    /**
     * callbackSuccess for inapppurchase and inapprestore 
     */
    callbackSuccess: function(){log("[IAP] Undefined callbackSuccess");},
    /**
     * callbackSuccess for inapppurchase and inapprestore 
     */
    callbackError: function(){log("[IAP] Undefined callbackError");},
    callbackListingSuccess: function(){log("[IAP] Undefined callbackListingSuccess");},
    callbackListingError: function(){log("[IAP] Undefined callbackListingError");},
    /**
     * callbackPurchaseSuccess for inAppProductInfo
     */
    callbackPurchaseSuccess: function(){log("[IAP] Undefined callbackPurchaseSuccess");},
    requestedListingProductId: '',
    /**
     * true when inapppurchase is requested by the user 
     */
    inappPurchaseCalled: false,
    /**
     * true when inappproductinfo is requested by the user
     */
    inappProductInfoCalled: false,
    lastCreateUserProduct: null,
    lastCreateUserToken: null,
    
    refreshDone: false,
    lastCreateuserUrl: '',
    lastCreateuserData: '',
    createUserAttempt: 0,
    maxCreateUserAttempt: 6,
    
    refreshInProgress: false,
    productsInfo: {},
    
    /**
     * @param {object} initializeConf - configuration sent by
     * @return {boolean} - true if init ok
     */
	initialize: function (initializeConf) {
        if (!window.store) {
            err("[IAP] Store not available, missing cordova plugin.");
            return false;
        }
		
        // initialize with current url
        IAP.returnUrl = document.location.href;

        if (initializeConf.id) {
            IAP.id = initializeConf.id;
        } else {
            if (isRunningOnAndroid()) {
                IAP.id = initializeConf.id_android;
            }
            else if (isRunningOnIos()) {
                IAP.id = initializeConf.id_ios;
            }
        }
        
        if (!IAP.id) {
            err("[IAP] Configuration error, missing product id!");
            return false;
        }

        // 
        if (initializeConf.alias) {
            IAP.alias = initializeConf.alias;
        }

        //  --- type ---
        // store.FREE_SUBSCRIPTION = "free subscription";
        // store.PAID_SUBSCRIPTION = "paid subscription";
        // store.CONSUMABLE        = "consumable";
        // store.NON_CONSUMABLE    = "non consumable";
        if (initializeConf.type) {
            IAP.type = initializeConf.type;
        }
        
        if (initializeConf.api_createuser) {
            IAP.subscribeMethod = initializeConf.api_createuser;
        }

        // Available values: DEBUG, INFO, WARNING, ERROR, QUIET
        IAP.verbosity = 'INFO';

        IAP.paymethod = isRunningOnAndroid() ? 'gwallet' : 'itunes';


        log('IAP initialize id: '+IAP.id);
		
		if(isRunningOnAndroid()){
			IAP.getGoogleAccount();
		}
        window.store.verbosity = window.store[IAP.verbosity];
        // store.validator = ... TODO
        
        window.store.register({
            id:    IAP.id,
            alias: IAP.alias,
            type:  window.store[IAP.type]
        });
        
        window.store.when(IAP.alias).approved(function(p){IAP.onPurchaseApproved(p);});
        window.store.when(IAP.alias).verified(function(p){IAP.onPurchaseVerified(p);});
        window.store.when(IAP.alias).updated(function(p){IAP.onProductUpdate(p);});
		window.store.when(IAP.alias).owned(function(p){IAP.onProductOwned(p);});
		window.store.when(IAP.alias).cancelled(function(p){IAP.onCancelledProduct(p); });
		window.store.when(IAP.alias).error(function(errorPar){IAP.error(JSON.stringify(errorPar));});
        window.store.ready(function(){ IAP.onStoreReady();});
        window.store.when("order "+IAP.id).approved(function(order){IAP.onOrderApproved(order);});
        
        // When any product gets updated, refresh the HTML.
        window.store.when("product").updated(function(p){ IAP.saveProductInfo(p); });
        
        return true;
    },
    
    saveProductInfo: function(params) {
        IAP.refreshInProgress = false;
        if (typeof params !== "object") {
            err("[IAP] saveProductInfo() got invalid data");
            return;
        }
        
        if ("id" in params) {
            IAP.productsInfo[params.id] = params;
            
        } else {
            err("[IAP] saveProductInfo() got invalid data, id undefined");
            return;
        }
        
        if (IAP.requestedListingProductId === params.id) {
                
            IAP.callbackListingSuccess(params);
        }
    },
    
    doRefresh: function(force) {
        if (IAP.refreshInProgress) {
            war("[IAP] doRefresh() refresh in progress, skipping...");
        }
        if (!IAP.refreshDone || force) {
            window.store.refresh();
            IAP.refreshDone = true;
            IAP.refreshInProgress = true;
            log("[IAP] doRefresh() refreshing...");            
        }
    },

    getPassword: function (transactionId){
        return md5('iap.'+transactionId+'.playme').substr(0,8);
    },
	
	getGoogleAccount: function(){
		window.accountmanager.getAccounts(IAP.checkGoogleAccount, IAP.error, "com.google");	
	},
	
	checkGoogleAccount: function(result){
		
		if(result) {
			log('[IAP] accounts');
			log(result);
			
			for(var i in result){
				window.localStorage.setItem('googleAccount', result[i].email);
				return result[i].email;
			}
		}	
	},
 
    onProductUpdate: function(p){
        log('IAP> Product updated.');
        log(JSON.stringify(p));
        if (p.owned) {
            log('[IAP] Subscribed!');
        } else {
            log('[IAP] Not Subscribed');
        }
    },
    
    onPurchaseApproved: function(p){
        log('IAP> Purchase approved.');
        log(JSON.stringify(p));
        //p.verify(); TODO before finish		
        p.finish();
    },
    onPurchaseVerified: function(p){
        log("subscription verified ", p);
        //p.finish(); TODO
    },
    onStoreReady: function(){
        log("\\o/ STORE READY \\o/");
        /*store.ask(IAP.alias)
        .then(function(data) {
              console.log('Price: ' + data.price);
              console.log('Description: ' + data.description);
              })
        .error(function(err) {
               // Invalid product / no connection.
               console.log('ERROR: ' + err.code);
               console.log('ERROR: ' + err.message);
               });*/
    },
    
    onProductOwned: function(p){
        log('[IAP] > Product Owned.');
        if (!p.transaction.id && isRunningOnIos()){
            err('[IAP] > no transaction id');
            return false;
        }
        window.localStorage.setItem('product', p);
		if(isRunningOnIos()){
			window.localStorage.setItem('transaction_id', p.transaction.id);
		}
        
        if (isRunningOnAndroid()){
            var purchase_token = p.transaction.purchaseToken + '|' + appPackageName + '|' + IAP.id;
            log('[IAP] Purchase Token: '+purchase_token);
            
            if(!window.localStorage.getItem('user_account')){
                IAP.createUser(p, purchase_token);
            }
            
        } else {
        
            window.storekit.loadReceipts(function (receipts) {
                
                if(!window.localStorage.getItem('user_account')){
                    if (!!!receipts.appStoreReceipt) {
                        log('[IAP] appStoreReceipt empty, ignoring request');
                    }
                    else {
                        log('[IAP] appStoreReceipt: ' + receipts.appStoreReceipt);
                        IAP.createUser(p, receipts.appStoreReceipt);
                    }
                }
            });
        }
        
    },
    
    onCancelledProduct: function(p){
        setBusy(false);
        IAP.callbackError({'iap_cancelled': 1, 'return_url' : IAP.returnUrl});
        log('[IAP] > Purchase cancelled ##################################', p);
    },
    
    onOrderApproved: function(order){
       log("[IAP] ORDER APPROVED "+IAP.id);
       order.finish();
    },
	
	error: function(error) {
        setBusy(false);
		err('[IAP] error: '+error);	
        
        IAP.callbackError({'iap_error': 1, 'return_url' : IAP.returnUrl});
	},
	
    getRandomEmail: function() {
        var randomPart = Math.floor(Math.random() * (10000 - 1000) + 1000).toString();
        return "fake" + randomPart + (Date.now()) + "@example.com";
    },
    
	createUser: function(product, purchaseToken){
        log('[IAP] createUser start ');
	    
        // if i'm here before user request inapp purchase/restore
        //  or in app product info
        //  i save data for calling again me when requested.
        if (!IAP.inappProductInfoCalled && !IAP.inappPurchaseCalled) {
            IAP.lastCreateUserProduct = product;
            IAP.lastCreateUserToken = purchaseToken;
            return;
        }
        
        
        if (!IAP.subscribeMethod) {
            err("[IAP] createUser configuration error: missing api url.");
            return;
        }
        
        var userAccount = IAP.getRandomEmail();
        var isFakeEmail = 1; 
        
        if (isRunningOnAndroid() && window.localStorage.getItem('googleAccount')) {
            userAccount = window.localStorage.getItem('googleAccount');
            isFakeEmail = 0;
        }

		window.localStorage.setItem('user_account', userAccount);
		
        var url = IAP.subscribeMethod;		
		
        var formData = {
            "paymethod": IAP.paymethod,
            "user_account": userAccount,
            "email_is_fake": isFakeEmail,
            "purchase_token": purchaseToken,
            "return_url": IAP.returnUrl,
            "inapp_pwd": IAP.getPassword(purchaseToken),
            "hybrid": 1
        };

        IAP.lastCreateuserUrl = url;
        IAP.lastCreateuserData = formData;

        var onCreateError = function(error) {
            if (IAP.createUserAttempt <= IAP.maxCreateUserAttempt) {
                err("[IAP] createUser failed "+IAP.createUserAttempt+
                    " times, trying again... last error: "+JSON.stringify(error)
                );

                // trying again
                createUserAjaxCall();
            }
            else {
                // no more try, fail to webapp callbackerror

                err('[IAP] createUser onCreateError: removing user_account');
                window.localStorage.removeItem('user_account');

                var stargateResponseError = {"iap_error" : "1", "return_url" : IAP.returnUrl};
                setBusy(false);
                
                if (IAP.inappPurchaseCalled) {
                    IAP.callbackError(stargateResponseError);
                } else if (IAP.inappProductInfoCalled) {
                    IAP.callbackListingError(stargateResponseError);                    
                }
            }
        };

        var onCreateSuccess = function(user) {
            log('[IAP] createUser success ', user);
            try {
                user.device_id = runningDevice.uuid;
                if(window.localStorage.getItem('transaction_id')){
                    user.transaction_id = window.localStorage.getItem('transaction_id');
                }
                setBusy(false);
                IAP.callbackSuccess(user);
                
                if (IAP.inappPurchaseCalled) {
                    IAP.callbackSuccess(user);
                } else if (IAP.inappProductInfoCalled) {
                    IAP.callbackPurchaseSuccess(user);                    
                }
            }
            catch (error) {
                onCreateError(error);
            }
        };

        var startTimeoutSeconds = 10;

        var createUserAjaxCall = function() {
            setTimeout(function() {
                    IAP.createUserAttempt = IAP.createUserAttempt + 1;

                    log('[IAP] createUser attempt: '+IAP.createUserAttempt+
                        ' with timeout: '+startTimeoutSeconds+'sec.');
                    
                    log("[IAP] POST createUser: "+IAP.lastCreateuserUrl+
                        " params: "+JSON.stringify(IAP.lastCreateuserData)+
                        " timeout: "+startTimeoutSeconds * 1000);
                    
                    window.aja()
                        .method('POST')
                        .url(IAP.lastCreateuserUrl)
                        .cache(false)
                        .timeout(startTimeoutSeconds * 1000) // milliseconds
                        .data(IAP.lastCreateuserData)
                        .on('success', function(user){
                            onCreateSuccess(user);
                        })
                        .on('error', function(error){
                            onCreateError(error);
                        })
                        .on('4xx', function(error){
                            onCreateError(error);
                        })
                        .on('5xx', function(error){
                            onCreateError(error);
                        })
                        .on('timeout', function(){
                            onCreateError("timeout");
                        })
                        .on('end', function(){
                            log("[IAP] createUser end");
                            setBusy(false);
                        })
                        .go();

                    // more timeout
                    startTimeoutSeconds = startTimeoutSeconds + 5;

                },
                10 // millisecond after it's executed (when the thread that called setTimeout() has terminated)
            );
        };

        IAP.createUserAttempt = 0;

        // start first attempt
        createUserAjaxCall();
        
	},

    
};


var globalization = (function(){
    
	var protectedInterface = {};

    var preferredLanguage = {};
    var localeName = {};

    var initFinished = false;

    protectedInterface.initialize = function() {
        if (typeof window.navigator !== "object" || typeof window.navigator.globalization !== "object") {
            err("[globalization] missing cordova plugin!");
            return false;
        }

        var prefLangPromise = new Promise(function(resolve){
            navigator.globalization.getPreferredLanguage(
                function(props) {
                    if (typeof props !== "object") {
                        err("[globalization] initialize getPreferredLanguage result error: invalid type", props);
                        resolve({"error":"invalid type"});
                        return;
                    }
                    log("[globalization] initialize getPreferredLanguage result ok: ", props);
                    preferredLanguage = props;
                    resolve(props);
                },
                function(error) {
                    err("[globalization] initialize getPreferredLanguage result error: ", error);
                    resolve({"error":error});
                }
            );
        }); // end prefLangPromise

        var locaNamePromise = new Promise(function(resolve){
            navigator.globalization.getLocaleName(
                function(props) {
                    if (typeof props !== "object") {
                        err("[globalization] initialize getLocaleName result error: invalid type", props);
                        resolve({"error":"invalid type"});
                        return;
                    }
                    log("[globalization] initialize getLocaleName result ok: ", props);
                    localeName = props;
                    resolve(props);
                },
                function(error) {
                    err("[globalization] initialize getLocaleName result error: ", error);
                    resolve({"error":error});
                }
            );
        }); // end locaNamePromise


        return Promise.all([prefLangPromise, locaNamePromise]).then(function(results){
            initFinished = true;
            return results;
        });
    };

    protectedInterface.getPreferredLanguage = function() {
        if (!initFinished) {
            err("[globalization] getPreferredLanguage: not initialized!");
            return false;
        }
        return preferredLanguage;
    };
    protectedInterface.getLocaleName = function() {
        if (!initFinished) {
            err("[globalization] getLocaleName: not initialized!");
            return false;
        }
        return localeName;
    };

    return protectedInterface;
})();

/* global facebookConnectPlugin */


stargatePublic.facebookLogin = function(scope, callbackSuccess, callbackError) {


    // FIXME: check that facebook plugin is installed
    // FIXME: check parameters

    if (!isStargateInitialized) {
        return callbackError("Stargate not initialized, call Stargate.initialize first!");
    }
    
    facebookConnectPlugin.login(
        scope.split(","),

        // success callback
        function (userData) {
            log("[facebook] got userdata: ", userData);
            
            facebookConnectPlugin.getAccessToken(
                function(token) {
                    callbackSuccess({'accessToken' : token});
                },
                function(err) {
                    callbackError({'error': err});
                }
            );
        },

        // error callback
        function (error) {
            err("Got FB login error:", error);
            callbackError({'error': error});
        }
    );
};

stargatePublic.facebookShare = function(url, callbackSuccess, callbackError) {

    // FIXME: check that facebook plugin is installed
    // FIXME: check parameters

    if (!isStargateInitialized) {
        return callbackError("Stargate not initialized, call Stargate.initialize first!");
    }

    var options = {
        method: "share",
        href: url
    };
    
    facebookConnectPlugin.showDialog(
        options, 
        
        function(message){
            callbackSuccess({'message':message});
        }, 

        function(error){

            // error.errorMessage
            err("Got FB share error:", error);
            callbackError({'error':error});
        }
    );
};

/* global deltadna */

var onDeltaDNAStartedSuccess = function() {
    deltadna.registerPushCallback(
		onDeltaDNAPush
	);
};


var onDeltaDNAStartedError = function(error) {
    err("[DeltaDNA] error: " + error);
};

var onDeltaDNAPush = function(pushDatas) {
    if(isRunningOnAndroid() && pushDatas.payload && pushDatas.payload.url && !pushDatas.foreground){
		return launchUrl(pushDatas.payload.url);
	}
    if(isRunningOnIos() && pushDatas.url){
        return launchUrl(pushDatas.url);
    }
};
var codepush = (function(){
    
	var protectedInterface = {};

    var registeredCallbacks = {};
    
    var onSyncStatus = function(status) {
        log("[CodePush] syncStatus: " + 
            protectedInterface.syncStatus[status]);
        
        if (registeredCallbacks[status] && Array === registeredCallbacks[status].constructor) {
            registeredCallbacks[status].forEach(function(cb){
                cb(status);
            });
        }
    };

    /**
     * SyncStatus.UP_TO_DATE
     * Result status - the application is up to date.
     * 
     * SyncStatus.UPDATE_INSTALLED
     * Result status - an update is available, it has been downloaded, unzipped and copied to the deployment folder.
     * After the completion of the callback invoked with SyncStatus.UPDATE_INSTALLED, the application will be reloaded with the updated code and resources.
     *   
     * SyncStatus.UPDATE_IGNORED
     * Result status - an optional update is available, but the user declined to install it. The update was not downloaded.
     * 
     * SyncStatus.ERROR
     * Result status - an error happened during the sync operation. This might be an error while communicating with the server, downloading or unziping the update.
     * The console logs should contain more information about what happened. No update has been applied in this case.
     * 
     * SyncStatus.IN_PROGRESS
     * Result status - there is an ongoing sync in progress, so this attempt to sync has been aborted.
     * 
     * SyncStatus.CHECKING_FOR_UPDATE
     * Intermediate status - the plugin is about to check for updates.
     * 
     * SyncStatus.AWAITING_USER_ACTION
     * Intermediate status - a user dialog is about to be displayed. This status will be reported only if user interaction is enabled.
     * 
     * SyncStatus.DOWNLOADING_PACKAGE
     * Intermediate status - the update packages is about to be downloaded.
     * 
     * SyncStatus.INSTALLING_UPDATE
     * Intermediate status - the update package is about to be installed.
     */
    protectedInterface.syncStatus = {
        0: "UP_TO_DATE",
        1: "UPDATE_INSTALLED",
        2: "UPDATE_IGNORED",
        3: "ERROR",
        4: "IN_PROGRESS",
        5: "CHECKING_FOR_UPDATE",
        6: "AWAITING_USER_ACTION",
        7: "DOWNLOADING_PACKAGE",
        8: "INSTALLING_UPDATE",
        AWAITING_USER_ACTION: 6,
        CHECKING_FOR_UPDATE: 5,
        DOWNLOADING_PACKAGE: 7,
        ERROR: 3,
        INSTALLING_UPDATE: 8,
        IN_PROGRESS: 4,
        UPDATE_IGNORED: 2,
        UPDATE_INSTALLED: 1,
        UP_TO_DATE: 0,
    };

    protectedInterface.registerForNotification = function(status, callback) {
        if (!status) {
            err("[CodePush] registerForNotification: undefined status requested");
            return false;
        }
        if (typeof callback !== "function") {
            err("[CodePush] registerForNotification: callback is not a function");
            return false;
        }
        if (!registeredCallbacks[status]) {
            registeredCallbacks[status] = [];
        }

        registeredCallbacks[status].push(callback);
        return true;        
    };

    var onDownloadProgress = function(downloadProgress) {
        if (downloadProgress) {
            // Update "downloading" modal with current download %
            log("[CodePush] Downloading " + downloadProgress.receivedBytes + " of " + downloadProgress.totalBytes);
        }
    };

    protectedInterface.initialize = function() {
        if (typeof window.codePush === "undefined") {
            err("[CodePush] missing cordova plugin!");
            return false;
        }

        protectedInterface.syncStatus = window.SyncStatus;

        // Silently check for the update, but
        // display a custom downloading UI
        // via the SyncStatus and DowloadProgress callbacks
        window.codePush.sync(onSyncStatus, null, onDownloadProgress);
    };

    return protectedInterface;
})();



var appsflyer = (function(){

	var af = {};
	var cb;

	/*
		https://support.appsflyer.com/hc/en-us/articles/207032126-AppsFlyer-SDK-Integration-Android
		https://support.appsflyer.com/hc/en-us/articles/207032096-Accessing-AppsFlyer-Attribution-Conversion-Data-from-the-SDK-Deferred-Deeplinking-
		{
		"af_status": "Non-organic",
		"media_source": "tapjoy_int",
		"campaign": "July4-Campaign",
		"agency": "starcomm",
		"af_siteid": null,
		"af_sub1": "subtext1",
		"af_sub2": null,
		"af_sub3": null,
		"af_sub4": null,
		"af_sub5": null,
		"freehand-param": "somevalue",
		"click_time": "2014-05-23 20:11:31",
		"install_time": "2014-05-23 20:12:16.751"
		}
	*/

	af.init = function(configuration) {

		if (!window.plugins || !window.plugins.appsFlyer) {

			// plugin is not installed

			return err("[appsflyer] missing cordova plugin");
		}

		
		if (typeof stargateConf.appsflyer_devkey === "undefined") {
			return err("[appsflyer] missing manifest configuration: appsflyer_devkey");
	    }

	    //
	    // apInitArgs[0] => AppsFlyer Developer Key
	    // apInitArgs[1] => iOS App Store Id
	    //
		var apInitArgs = {
            devKey: stargateConf.appsflyer_devkey,
            isDebug: false,
            onInstallConversionDataListener: true
        };

	    if (isRunningOnIos()) {
            if (typeof stargateConf.appstore_appid === "undefined") {
                return err("[appsflyer] missing manifest configuration: appstore_appid");
            }
	        apInitArgs.appId = stargateConf.appstore_appid;
	    }

        var onInstallConversionData = function(conversionData){

            if (typeof cb !== 'function') {
                return console.log("[Stargate] [appsflyer] callback not set!");
            }

            if(window.localStorage.getItem('appsflyerSetSessionDone')){
                cb(null);
                return true;
            }

            // if(runningDevice.uuid=="2fbd1a9b9e224f94")
            //    conversionData.af_sub1="PONY=12-19a76196f3b04f1ff60e82aa1cf5f987999999END";

            // send it
            try {
                if (typeof conversionData === 'string') {
                    conversionData = JSON.parse(conversionData);
                }
                if (conversionData.type && conversionData.type == "onInstallConversionDataLoaded" && 
                    conversionData.data) {
                        conversionData = conversionData.data;
                }
                cb(conversionData);
                console.log("[Stargate] [appsflyer] parameters sent to webapp callback: "+JSON.stringify(conversionData));
            }
            catch (error) {
                console.error("[Stargate] [appsflyer] callback error: "+error, error);
            }

            console.log('[Stargate] [appsflyer] configuration:', configuration);

            if(!window.localStorage.getItem('appsflyerSetSessionDone') && configuration.autologin){

                var fieldPony = "af_sub1";
                if (configuration.fieldPony) {
                    fieldPony = configuration.fieldPony;
                }
                var fieldReturnUrl = "";
                if (configuration.fieldReturnUrl) {
                    fieldReturnUrl = configuration.fieldReturnUrl;
                }

                window.localStorage.setItem('appsflyerSetSessionDone', 1);
                if (typeof conversionData === 'object') {

                    if (conversionData[fieldPony]) {
                        var returnUrl = null;
                        if (fieldReturnUrl && conversionData[fieldReturnUrl]) {
                            returnUrl = conversionData[fieldReturnUrl];
                        }

                        window.setTimeout(function(){
                            console.log("[Stargate] [appsflyer] perform autologin");
                            
                            if (configuration.cbOnAfOkPreSession &&  (typeof configuration.cbOnAfOkPreSession === 'function')) {
                                var cbOnAfOkPreSession = configuration.cbOnAfOkPreSession;
                                cbOnAfOkPreSession();
                            }
                            MFP.setSession(conversionData[fieldPony], returnUrl);
                        }, 100);

                        return;
                    }
                }
            }
            if (configuration.cbOnAfEmptySession &&  (typeof configuration.cbOnAfEmptySession === 'function')) {
                var cbOnAfEmptySession = configuration.cbOnAfEmptySession;
                cbOnAfEmptySession();
            }

  		};
        
        var onError = function(e) {
            console.error("[Stargate] [appsflyer] plugin error: "+e, e);
        };

		window.plugins.appsFlyer.initSdk(apInitArgs, onInstallConversionData, onError);
	};

	/**
     * @name analytics#setCallback
     * @memberof analytics
     *
     * @description Save webapp callback to be called when appsflyer data
     *
     * @param {function} callback
     */
	af.setCallback = function(callback) {
		cb = callback;
	};

	return af;

})();

/**
 * @name Stargate#setConversionDataCallback
 * @memberof Stargate
 *
 * @description Save webapp conversion data callback to be called when converion data from AppsFlyer are received.
 *              You may need to save the data you receive, becouse you'll only got that data the first time the app
 *              is run after installation.
 *              Please call this before Stargate.initialize()
 *
 * @param {function} callback
 */
stargatePublic.setConversionDataCallback = function(callback) {

	appsflyer.setCallback(callback);
};


/**
 * @namespace
 * @protected
 *
 * @description
 * Analytics is a module to track events sending it to a webapp callback.
 * It's used internally in Stargate to track events like MFP get.
 * Before using it you need to set the callback calling {@link Stargate#setAnalyticsCallback}
 * 
 */
var analytics = (function(){

	var cb;
	var ana = {};

	/**
     * @name analytics#track
     * @memberof analytics
     *
     * @description Send an event to webapp analytics callback if it's defined
     *
     * @param {object} event
     */
	ana.track = function(trackedEvent) {

		if (typeof cb !== 'function') {
			return log("[analytics] callback not set!");
		}

		// send it
		try {
			cb(trackedEvent);
		}
		catch (error) {
			err("[analytics] callback error: "+error, error);
		}
	};

	/**
     * @name analytics#setCallback
     * @memberof analytics
     *
     * @description Save webapp analytics callback to be called when an event is tracked
     *
     * @param {function} callback
     */
	ana.setCallback = function(callback) {
		cb = callback;
	};

	return ana;
})();


/**
 * @name Stargate#setAnalyticsCallback
 * @memberof Stargate
 *
 * @description Save webapp analytics callback to be called when an event inside Stargaed need to be tracked
 *
 * @param {function} callback
 */
stargatePublic.setAnalyticsCallback = function(callback) {

	analytics.setCallback(callback);
};

/* globals AdMob, MoPub */

var AdManager = {

	AdMobSupport: false,
	MoPubSupport: false,
	AdPosition: {
		NO_CHANGE: 0,
		TOP_LEFT: 1,
		TOP_CENTER: 2,
		TOP_RIGHT: 3,
		LEFT: 4,
		CENTER: 5,
		RIGHT: 6,
		BOTTOM_LEFT: 7,
		BOTTOM_CENTER: 8,
		BOTTOM_RIGHT: 9,
		POS_XY: 10
	},
	AdSize: {
		SMART_BANNER: 'SMART_BANNER',
		BANNER: 'BANNER',
		MEDIUM_RECTANGLE: 'MEDIUM_RECTANGLE',
		FULL_BANNER: 'FULL_BANNER',
		LEADERBOARD: 'LEADERBOARD',
		SKYSCRAPER: 'SKYSCRAPER'
	},
	DefaultOptions : null,
		
	initialize: function (options, success, fail) {
		if(options)
			AdManager.DefaultOptions = options;
			
		if (AdMob) { 
			AdManager.AdMobSupport = true;
			AdManager.initAdMob(options, success, fail);
		}
		
		if (MoPub) { 
			AdManager.MoPubSupport = true;
		}	
		
		return true;
	},
	
	isAdMobSupported: function(){
		return AdManager.AdMobSupport;
	},
	
	isMoPubSupported: function(){
		return AdManager.MoPubSupport;
	},
	
	getUserAgent: function(){
		if( /(android)/i.test(navigator.userAgent) ) {
			return "android";
		} else if(/(ipod|iphone|ipad)/i.test(navigator.userAgent)) {
			return "ios";
		} else {
			return "other";
		}
	},
	
	/* setOptions(options, success, fail); */
	initAdMob: function(options, success, fail){
	
		var defaultOptions = {
			//bannerId: AdManager.AdMobID[userAgent].banner,
			//interstitialId: AdManager.AdMobID[userAgent].interstitial,
			adSize: 'BANNER',
			// width: integer, // valid when set adSize 'CUSTOM'
			// height: integer, // valid when set adSize 'CUSTOM'
			position: 8,
			// offsetTopBar: false, // avoid overlapped by status bar, for iOS7+
			bgColor: 'black', // color name, or '#RRGGBB'
			// x: integer, // valid when set position to 0 / POS_XY
			// y: integer, // valid when set position to 0 / POS_XY
			isTesting: false, // set to true, to receiving test ad for testing purpose
			autoShow: true // auto show interstitial ad when loaded, set to false if prepare/show
		};
		AdMob.setOptions(defaultOptions, success, fail);
		
	},
	
	/* TODO if needed */
	//initMoPub: function(options, success, fail){
	//
	//},	
	
	registerAdEvents: function(eventManager) {
		document.addEventListener('onAdFailLoad', eventManager);
		document.addEventListener('onAdLoaded', eventManager);
		document.addEventListener('onAdPresent', eventManager);
		document.addEventListener('onAdLeaveApp', eventManager);
		document.addEventListener('onAdDismiss', eventManager);
	},
	
	manageAdEvents: function(data) {
	
		console.log('error: ' + data.error +
			', reason: ' + data.reason +
			', adNetwork:' + data.adNetwork +
			', adType:' + data.adType +
			', adEvent:' + data.adEvent); 
	},
	
	/*
	createBanner(data, success, fail);
	data could be an object (one network) or an array of network info
	each network is an object with position, autoShow, banner, full_banner, leaderboard, ecc
	data = [{network: "dfp", device: "android", position: "BOTTOM_CENTER", banner: "/1017836/320x50_Radio_Leaderboard", autoShow: true},
			{network: "mopub", device: "ios", position: "BOTTOM_CENTER", banner: "agltb3B1Yi1pbmNyDAsSBFNpdGUY8fgRDA", autoShow: true}];
	*/
	createBanner: function(data, success, fail) {
		var options = {};
		var opt = [];
		var userAgent = AdManager.getUserAgent();
		
		/* no data, we use DefaultOptions */
		if(!data){
			if(!AdManager.isObjEmpty(AdManager.DefaultOptions)){
				data = AdManager.DefaultOptions;
			}		
		}
		
		if(!Array.isArray(data)){
			opt.push(data);
		}
		else {
			opt = data;
		}
		
		opt.forEach(function(entry) {
            if(entry.device == 'default' || entry.device == userAgent){
			
				var adId = AdManager.getAdSize().toLowerCase();					
			
				if(entry.overlap) options.overlap = entry.overlap;
				if(entry.offsetTopBar) options.offsetTopBar = entry.offsetTopBar;
				options.adSize = AdManager.getAdSize();
				if(adId) options.adId = entry[adId];
				if(entry.position) options.position = AdManager.AdPosition[entry.position];
				if(entry.width) options.width = entry.width;
				if(entry.height) options.height = entry.height;
				if(entry.autoShow) options.autoShow = entry.autoShow;
				
				if(entry.network.toLowerCase() == 'admob' || entry.network.toLowerCase() == 'dfp'){
					if(entry.width && entry.height){
						options.adSize = 'CUSTOM';
					}
					AdMob.createBanner(options, success, fail);
				}
				else if(entry.network.toLowerCase().toLowerCase() == 'mopub'){
					MoPub.createBanner(options, success, fail);
				}			
			}
		});
	},
	
	/*
	data could be an object (one network) or an array of network info
	each entry is an object with position, device and network properties
	data = [{network: "dfp", device: "android", position: "BOTTOM_CENTER"},
			{network: "mopub", device: "ios", position: "BOTTOM_CENTER"}];
	data.network could be admob, mopub, dfp
	data.position could be: NO_CHANGE, TOP_LEFT, TOP_CENTER, TOP_RIGHT, LEFT, CENTER, RIGHT, BOTTOM_LEFT, BOTTOM_CENTER, BOTTOM_RIGHT, POS_XY
	*/
	showBannerAtSelectedPosition: function(data) {
	
		var opt = [];
		var userAgent = AdManager.getUserAgent();
		
		/* no data, we use DefaultOptions */
		if(!data){
			if(!AdManager.isObjEmpty(AdManager.DefaultOptions)){
				data = AdManager.DefaultOptions;
			}		
		}
		
		if(!Array.isArray(data)){
			opt.push(data);
		}
		else {
			opt = data;
		}
		
		opt.forEach(function(entry) {
            if(entry.device == 'default' || entry.device == userAgent){
			
				if(entry.network.toLowerCase() == 'admob' || entry.network.toLowerCase() == 'dfp'){
					AdMob.showBanner(entry.position);
				}
				else if(entry.network.toLowerCase().toLowerCase() == 'mopub'){
					MoPub.showBanner(entry.position);
				}	
			
			}
		});
	},
	
	/*
	data could be an object (one network) or an array of network info
	each entry is an object with position, device and network properties
	data = [{network: "dfp", device: "android", x: "", y: ""},
			{network: "mopub", device: "ios", x: "", y: ""}];
	data.network could be admob, mopub, dfp
	*/
	showBannerAtGivenXY: function(data) {
	
		var opt = [];
		var userAgent = AdManager.getUserAgent();
		
		/* no data, we use DefaultOptions */
		if(!data){
			if(!AdManager.isObjEmpty(AdManager.DefaultOptions)){
				data = AdManager.DefaultOptions;
			}		
		}
		
		if(!Array.isArray(data)){
			opt.push(data);
		}
		else {
			opt = data;
		}
		
		opt.forEach(function(entry) {
            if(entry.device == 'default' || entry.device == userAgent){
			
				if(entry.network.toLowerCase() == 'admob' || entry.network.toLowerCase() == 'dfp'){
					AdMob.showBannerAtXY(entry.x, entry.y);
				}
				else if(entry.network.toLowerCase().toLowerCase() == 'mopub'){
					MoPub.showBannerAtXY(entry.x, entry.y);
				}	
			
			}
		});
	},
	
	/*
	data could be an object (one network) or an array of network info
	each entry is an object with position, device and network properties
	data = [{network: "dfp", device: "android"},
			{network: "mopub", device: "ios"}];
	*/
	hideBanner: function(data) {
	
		var opt = [];
		var userAgent = AdManager.getUserAgent();
		
		/* no data, we use DefaultOptions */
		if(!data){
			if(!AdManager.isObjEmpty(AdManager.DefaultOptions)){
				data = AdManager.DefaultOptions;
			}		
		}
		
		if(!Array.isArray(data)){
			opt.push(data);
		}
		else {
			opt = data;
		}
		
		opt.forEach(function(entry) {
            if(entry.device == 'default' || entry.device == userAgent){
			
				if(entry.network.toLowerCase() == 'admob' || entry.network.toLowerCase() == 'dfp'){
					AdMob.hideBanner();
				}
				else if(entry.network.toLowerCase().toLowerCase() == 'mopub'){
					MoPub.hideBanner();
				}	
			
			}
		});
	},
	
	/*
	data could be an object (one network) or an array of network info
	each entry is an object with position, device and network properties
	data = [{network: "dfp", device: "android"},
			{network: "mopub", device: "ios"}];
	*/
	removeBanner: function(data) {
	
		var opt = [];
		var userAgent = AdManager.getUserAgent();
		
		/* no data, we use DefaultOptions */
		if(!data){
			if(!AdManager.isObjEmpty(AdManager.DefaultOptions)){
				data = AdManager.DefaultOptions;
			}		
		}
		
		if(!Array.isArray(data)){
			opt.push(data);
		}
		else {
			opt = data;
		}
		
		opt.forEach(function(entry) {
            if(entry.device == 'default' || entry.device == userAgent){
			
				if(entry.network.toLowerCase() == 'admob' || entry.network.toLowerCase() == 'dfp'){
					AdMob.removeBanner();
				}
				else if(entry.network.toLowerCase().toLowerCase() == 'mopub'){
					MoPub.removeBanner();
				}	
			
			}
		});
	},
	
	/*
	data could be an object (one network) or an array of network info
	each entry is an object with position, device and network properties
	data = [{network: "dfp", device: "android", interstitial: ""},
			{network: "mopub", device: "ios", interstitial: ""}];
	*/
	prepareInterstitial: function(data, success, fail) {
	
		var options = {};
		var opt = [];
		var userAgent = AdManager.getUserAgent();
		
		/* no data, we use DefaultOptions */
		if(!data){
			if(!AdManager.isObjEmpty(AdManager.DefaultOptions)){
				data = AdManager.DefaultOptions;
			}		
		}
		
		if(!Array.isArray(data)){
			opt.push(data);
		}
		else {
			opt = data;
		}
		
		opt.forEach(function(entry) {
            if(entry.device == 'default' || entry.device == userAgent){				
			
				if(entry.interstitial) options.adId = entry.interstitial;
				if(entry.autoShow) options.autoShow = entry.autoShow;
				
				if(entry.network.toLowerCase() == 'admob' || entry.network.toLowerCase() == 'dfp'){
					AdMob.prepareInterstitial(options);
				}
				else if(entry.network.toLowerCase() == 'mopub'){
					MoPub.prepareInterstitial(options, success, fail);
				}
			}
		});
	},
	
	/*
	data could be an object (one network) or an array of network info
	each entry is an object with position, device and network properties
	data = [{network: "dfp", device: "android", interstitial: ""},
			{network: "mopub", device: "ios", interstitial: ""}];
	*/
	showInterstitial: function(data) {
	
		var opt = [];
		var userAgent = AdManager.getUserAgent();
		
		/* no data, we use DefaultOptions */
		if(!data){
			if(!AdManager.isObjEmpty(AdManager.DefaultOptions)){
				data = AdManager.DefaultOptions;
			}		
		}
		
		if(!Array.isArray(data)){
			opt.push(data);
		}
		else {
			opt = data;
		}
		
		opt.forEach(function(entry) {
            if(entry.device == 'default' || entry.device == userAgent){
			
				if(entry.network.toLowerCase() == 'admob' || entry.network.toLowerCase() == 'dfp'){
					AdMob.showInterstitial();
				}
				else if(entry.network.toLowerCase().toLowerCase() == 'mopub'){
					MoPub.showInterstitial();
				}	
			
			}
		});
	},
	
	isObjEmpty: function(obj) {
		return Object.keys(obj).length === 0;
	},
	
	getAdSize: function(){
	
		var height = screen.height;
		var width = screen.width;
	
		if(width >= 728 && height >= 90 ) {
			return AdManager.AdSize.LEADERBOARD;
		} else if (width >= 468 && height >= 60 ) {
			//return AdManager.AdSize.FULL_BANNER;
			return AdManager.AdSize.BANNER;
		} else if (width >= 320 && height >= 50 ) {
			return AdManager.AdSize.BANNER;
			
		}
	}
	
	
};
    stargatePublic.game = stargateModules.game._public;
    stargatePublic.file = stargateModules.file;    stargatePublic.AdManager = stargateModules.AdManager;    // Just return a value to define the module export
    return stargatePublic;
}));


