function createLib(execlib) {
  return execlib.loadDependencies('client', ['allex:base:parser', 'allex:extractionbuffer:parser'], createVariableLengthTextParser.bind(null, execlib));
}

function createVariableLengthTextParser(execlib, BaseParser, DoubleBufferWithCursor) {
  'use strict';
  var lib = execlib.lib,
    q = lib.q,
    execSuite = execlib.execSuite;

  function cutOffByNumber (string, length) {
    return string.substring(length);
  }
  function cutOffByOtherString (string, otherstring) {
    return cutOffByNumber(string, otherstring.length);
  }
  function firstChars (string, charnumber) {
    return string.substring(0, charnumber);
  }

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
  };
  VariableLengthTextParser.prototype.fileToData = function (data) {
    return this.doubleBuffer.process(data);
  };
  VariableLengthTextParser.prototype.finalize = function(){
    if (this.doubleBuffer) {
      return this.doubleBuffer.finalize();
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
      } else {
        fieldres = this.produceField(string);
      }
      if (fieldres) {
        ret.push(fieldres.field);
        string = fieldres.string;
        while (string.length && string.indexOf(this.fieldDelimiter) !== 0) {
          string = cutOffByNumber(string, 1);
        }
      } else {
        break;
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
  
  return q(VariableLengthTextParser);
}

module.exports = createLib;
