function createVariableLengthTextParser(execlib) {
  'use strict';
  var lib = execlib.lib;

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
  BufferWithCursor.prototype.resetAnchor = function () {
    this.anchor = this.cursor;
  };
  BufferWithCursor.prototype.remaining = function () {
    return this.buffer.length - this.cursor;
  };
  BufferWithCursor.prototype.valueAtCursor = function (offset) {
    return this.buffer[this.cursor + (this.offset||0)];
  };
  BufferWithCursor.prototype.appendFrom = function (other, howmany) {
    other.buffer.copy(this.buffer,this.cursor,other.cursor,other.cursor+howmany); 
  };
  BufferWithCursor.prototype.appendTo = function (other, howmany) {
    this.buffer.copy(other.buffer,other.cursor,this.cursor,this.cursor+howmany);
  };
  BufferWithCursor.prototype.toString = function () {
    return this.buffer.slice(this.cursor).toString();
  };

  function VariableLengthTextParser(options) {
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
  }
  VariableLengthTextParser.prototype.destroy = function () {
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
  VariableLengthTextParser.prototype.notADelimiter = function (result) {
    var working = this.currentlyProcessed,
      rd = this.recordDelimiter,
      dl = rd.length,
      i = 0,
      dolog = false;
    if (dl > working.remaining()) {
      result.notLength = working.remaining();
      result.notA = null;
    }
    while (i < dl) {
      if (rd[i] !== working.valueAtCursor()) {
        if (dolog) {
          console.log(rd[i], '<>', working.valueAtCursor(), 'working at', working.cursor);
        }
        working.tick(i ? 1-i : 1); //tricky part - reset cursor to retry matching
        result.notA = true;
        result.notLength = i+1;
        return;
      }
      dolog = true
      console.log(rd[i], '==', working.valueAtCursor(), 'working at', working.cursor);
      working.tick(1);
      i++;
    }
    result.notLength = i;
    result.notA = false;
  };
  VariableLengthTextParser.prototype.tryMakeCompleteChunk = function () {
    var nad = {};
  };
  VariableLengthTextParser.prototype.fileToData = function (data) {
    var completechunk, nad = {}, rec, ret = [];
    this.previouslyProcessed = this.currentlyProcessed;
    this.currentlyProcessed = new BufferWithCursor(data);
    while (!this.currentlyProcessed.isProcessed()) {
      this.notADelimiter(nad);
      if(nad.notA === false){
        completechunk = this.currentlyProcessed.chunk();
        this.currentlyProcessed.resetAnchor();
        console.log('got it', completechunk.toString());
        if (completechunk) {
          if (this.isNewRecord(completechunk)) {
            rec = this.buffer;
            this.buffer = this.createBuffer(completechunk);
          } else {
            this.augmentBuffer(chunk);
          }
          if (rec) {
            ret.push(rec);
          }
        }
      }
    }
    return ret;
  };
  VariableLengthTextParser.prototype.finalize = function(){
    if(this.buffer){
      return this.buffer;
    }
  };
  VariableLengthTextParser.prototype.isNewRecord = function (data) {
    return true;
  };
  VariableLengthTextParser.prototype.createBuffer = function (data) {
    var ret = {},
      fields = data.toString().split(this.fieldDelimiter);
    this.fieldList.forEach(function(fieldname, fieldindex){
      ret[fieldname] = fields[fieldindex];
    });
    return ret;
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
  VariableLengthTextParser.prototype.fieldList = null;
  return VariableLengthTextParser;
}

module.exports = createVariableLengthTextParser;
