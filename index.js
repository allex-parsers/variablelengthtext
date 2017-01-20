function createVariableLengthTextParser(execlib) {
  'use strict';
  var lib = execlib.lib,
    q = lib.q,
    execSuite = execlib.execSuite,
    parserRegistry = execSuite.parserRegistry,
    d = q.defer();

  parserRegistry.register('allex_baseparser').done(
    doCreate.bind(null, d)
  );

  function cutOffByNumber (string, length) {
    return string.substring(length);
  }
  function cutOffByOtherString (string, otherstring) {
    return cutOffByNumber(string, otherstring.length);
  }
  function firstChars (string, charnumber) {
    return string.substring(0, charnumber);
  }

  function doCreate(defer, BaseParser) {
    function BufferWithCursor(param) {
      this.buffer = new Buffer(param);
      this.cursor = 0;
      this.anchor = 0;
    }
    BufferWithCursor.prototype.destroy = function () {
      this.anchor = 0;
      this.cursor = null;
      this.buffer = null;
    };
    BufferWithCursor.prototype.isProcessed = function () {
      return this.cursor >= this.buffer.length;
    };
    BufferWithCursor.prototype.tick = function (howmany) {
      this.cursor += howmany;
    };
    BufferWithCursor.prototype.chunk = function () {
      return this.buffer.slice(this.anchor, this.cursor);
    };
    BufferWithCursor.prototype.chunkLength = function () {
      if (this.cursor < this.anchor) {
        throw new lib.Error('INVALID_CURSOR_VS_ANCHOR_POSITION', this.cursor+' cannot be less than '+this.anchor);
      }
      return this.cursor - this.anchor;
    };
    BufferWithCursor.prototype.tail = function () {
      return this.buffer.slice(this.anchor);
    };
    BufferWithCursor.prototype.resetAnchor = function () {
      this.anchor = this.cursor;
    };
    BufferWithCursor.prototype.remaining = function () {
      return this.buffer.length - this.anchor;
    };
    BufferWithCursor.prototype.unprocessed = function () {
      return this.buffer.length - this.cursor;
    };
    BufferWithCursor.prototype.valueAtCursor = function (offset) {
      return this.buffer[this.cursor + (this.offset||0)];
    };
    BufferWithCursor.prototype.appendFrom = function (other, howmany) {
      other.buffer.copy(this.buffer,this.cursor,other.cursor,other.cursor+howmany); 
    };
    BufferWithCursor.prototype.appendTo = function (other, howmany) {
      if ('undefined' === typeof howmany) {
        howmany = this.chunkLength();
      }
      this.buffer.copy(other.buffer,other.cursor,this.anchor,this.anchor+howmany);
      other.cursor+=howmany;
    };
    BufferWithCursor.prototype.toString = function () {
      return this.buffer.slice(this.cursor).toString();
    };

    function DoubleBufferWithCursor(parser){
      this.parser = parser;
      this.current = null;
      this.previous = null;
    }
    DoubleBufferWithCursor.prototype.destroy = function () {
      if (this.previous) {
        this.previous.destroy();
      }
      this.previous = null;
      if (this.current) {
        this.current.destroy();
      }
      this.current = null;
      this.parser = null;
    };
    DoubleBufferWithCursor.prototype.purgePrevious = function () {
      if (!this.previous) {
        throw new lib.Error('CANNOT_PURGE_PREVIOUS', 'Previous buffer cannot be purged because it does not exist');
      }
      this.previous.destroy();
      this.previous = null;
    };
    DoubleBufferWithCursor.prototype.process = function (buffer, cb) {
      if (this.previous) {
        if (this.previous.unprocessed() < 1) {
          this.purgePrevious();
        } else {
          throw new lib.Error('CANNOT_SET_BUFFER_PREVIOUS_STILL_EXISTS');
        }
      }
      this.previous = this.current;
      this.current = new BufferWithCursor(buffer);
      while (this.current.unprocessed()) {
        switch (this.atDelimiter()) {
          case null:
            return;
          case true:
            cb(this.chunk());
        }
      }
      //cb(this.chunk());
    };
    DoubleBufferWithCursor.prototype.atDelimiter = function () {
      var p = this.previous,
        c = this.current,
        rd = this.parser.recordDelimiter,
        dl = rd.length,
        i = 0,
        logobj = {dolog: false},
        w,
        cunp = c.unprocessed();
      if (dl > cunp) {
        if (cunp) {
          //console.log('that is it,',dl,'>',cunp, 'with tail', c.tail());
          //console.log('finished with buffer,',c.chunkLength(),'bytes left');
          return null;
        } else {
          return true;
        }
      }
      w = (p && p.unprocessed()) ? p : c;
      while (i < dl) {
        if (this.matchesDelimiter(rd, i, w, logobj)) {
          w = (p && p.unprocessed()) ? p : c;
        } else {
          return false;
        }
        i++;
      }
      return true;
    };
    DoubleBufferWithCursor.prototype.matchesDelimiter = function (delimiter, i, buffer, logobj) {
      if (delimiter[i] !== buffer.valueAtCursor()) {
        if (logobj.dolog) {
          //console.log(delimiter[i], '<>', buffer.valueAtCursor(), 'working at', buffer.cursor);
        }
        buffer.tick(i ? 1-i : 1); //tricky part - reset cursor to retry matching
        return false;
      }
      logobj.dolog = true;
      //console.log(delimiter[i], '==', buffer.valueAtCursor(), 'working at', buffer.cursor);
      buffer.tick(1);
      return true;
    };
    DoubleBufferWithCursor.prototype.chunk = function () {
      var pr = this.previous ? this.previous.remaining() : 0, l, c, ret;
      if (pr) {
        l = pr + this.current.chunkLength();
        c = new BufferWithCursor(l);
        this.previous.appendTo(c);
        //console.log('current',this.current,'will append to chunk',c.buffer);
        this.current.appendTo(c);
        //console.log('after appending, chunk',c.buffer);
        this.previous.destroy();
        this.previous = null;
        ret = c.buffer;
        c.destroy();
        this.current.resetAnchor();
        return ret;
      } else {
        ret = this.current.chunk();
        this.current.resetAnchor();
        return ret;
      }
    };

    function VariableLengthTextParser(options) {
      BaseParser.call(this, options);
      if(!(this.recordDelimiter instanceof Buffer)){
        throw new lib.Error('NO_RECORD_DELIMITER','VariableLengthTextParser must have a Buffer recordDelimiter defined in its prototype');
      }
      if(!lib.isString(typeof this.fieldDelimiter)){
        throw new lib.Error('NO_FIELD_DELIMITER','VariableLengthTextParser must have a String fieldDelimiter defined in its prototype');
      }
      if(!this.fieldList){
        throw new lib.Error('NO_FIELD_LIST','VariableLengthTextParser must have a fieldList Array defined in its prototype');
      }
      this.buffer = null;
      this.currentlyProcessed = null;
      this.previouslyProcessed = null;
      this.doubleBuffer = new DoubleBufferWithCursor(this);
    }
    lib.inherit(VariableLengthTextParser, BaseParser);
    VariableLengthTextParser.prototype.destroy = function () {
      if (this.doubleBuffer) {
        this.doubleBuffer.destroy();
      }
      this.doubleBuffer = null;
      if(this.currentlyProcessed){
        this.currentlyProcessed.destroy();
      }
      this.currentlyProcessed = null;
      if (this.previouslyProcessed) {
        this.previouslyProcessed.destroy();
      }
      this.previouslyProcessed = null;
      this.buffer = null;
    };
    VariableLengthTextParser.prototype.fileToData = function (data) {
      var ret = [];
      this.doubleBuffer.process(data, this.takeChunk.bind(this, ret));
      return ret;
    };
    VariableLengthTextParser.prototype.takeChunk = function (ret, completechunk) {
      var rec;
      if (completechunk) {
        if (this.isNewRecord(completechunk)) {
          rec = this.buffer;
          this.buffer = this.createBuffer(completechunk);
        } else {
          this.augmentBuffer(completechunk);
        }
        if (rec) {
          this.postProcessFileToData(rec);
          ret.push(rec);
        }
      }
    };
    VariableLengthTextParser.prototype.finalize = function(){
      //console.log('finalize',this.doubleBuffer.current.remaining(), this.doubleBuffer.chunk(), 'my buffer', this.buffer);
      if(this.buffer){
        this.postProcessFileToData(this.buffer);
        return this.buffer;
      }
    };
    VariableLengthTextParser.prototype.isNewRecord = function (data) {
      return true;
    };
    VariableLengthTextParser.prototype.createBuffer = function (data) {
      var stringdata = data.toString('utf8').trim();
      if (this.fieldList.length>0) {
        return this.createObjBuffer(stringdata);
      } else {
        return stringdata;
      }
    };
    VariableLengthTextParser.prototype.createObjBuffer = function (stringdata) {
      var ret = {},
        _ret = ret,
        fields = this.splitToFields(stringdata),
        _fields = fields;
      //console.log('fields', fields);
      this.fieldList.forEach(function(fieldname, fieldindex){
        _ret[fieldname] = _fields[fieldindex];
      });
      _ret = null;
      _fields = null;
      return ret;
    };
    VariableLengthTextParser.prototype.splitToFields = function (string) {
      var ret = [], fieldres;
      //console.log('splitToFields', string, this.fieldDelimiter);
      while (string.length > 0) {
        if (string.indexOf(this.fieldDelimiter) === 0) {
          fieldres = this.produceField(cutOffByOtherString(string, this.fieldDelimiter));
          if (fieldres) {
            ret.push(fieldres.field);
            string = fieldres.string;
          } else {
            break;
          }
        } else {
          string = cutOffByNumber(string, 1);
        }
      }
      return ret;
    };
    VariableLengthTextParser.prototype.produceField = function (string) {
      var fd = this.fieldDelimiter,
        td = this.textDelimiter,
        havetextdelimiter,
        field = '';
      //console.log('produceField', string);
      havetextdelimiter = string.indexOf(td) === 0;
      if (havetextdelimiter) {
        string = cutOffByOtherString(string, td);
      }
      while (string.length > 0) {
        //console.log('loop, string', string, 'field', field);
        if (string.indexOf(fd) === 0) {
          if (havetextdelimiter) {
            field += firstChars(string, 1);
            string = cutOffByNumber(string, 1);
            continue;
          } else {
            //string = cutOffByOtherString(string, fd);
            break;
          }
        }
        if (string.indexOf(td) === 0) {
          if (havetextdelimiter) {
            string = cutOffByNumber(string, 1);
            havetextdelimiter = false;
            continue;
          }
        }
        field += firstChars(string, 1);
        string = cutOffByNumber(string, 1);
      }
      //console.log('finally, string', string, 'field', field);
      return {field: field, string: string};
    };
    VariableLengthTextParser.prototype.createFileToDataItem = function (inputbuffer, resulthash, fieldprocessor, fieldprocessorname) {
      var range = fieldprocessor.range,
        rangelen = range[1]-range[0],
        align = fieldprocessor.align,
        item = inputbuffer.toString('utf8', fieldprocessor.range[0], fieldprocessor.range[1]).trim();
      if(!align && item.length!==rangelen){
        throw new lib.Error('FIELD_WITHOUT_ALIGN_MUST_HAVE_FULL_LENGTH','Field that should have been '+rangelen+' long turned out to be '+item.length+' long');
      }
      resulthash[fieldprocessorname] =  item;
    };
    VariableLengthTextParser.prototype.recordDelimiter = null;
    VariableLengthTextParser.prototype.fieldDelimiter = null;
    VariableLengthTextParser.prototype.textDelimiter = '"';
    VariableLengthTextParser.prototype.fieldList = null;
    defer.resolve(VariableLengthTextParser);
  }

  return d.promise;
}

module.exports = createVariableLengthTextParser;
