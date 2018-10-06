// app.js

var cfenv = require( 'cfenv' );
var express = require( 'express' );
var fs = require( 'fs' );
var bodyParser = require( 'body-parser' );
var multer = require( 'multer' );
var app = express();

var settings = require( './settings' );
var appEnv = cfenv.getAppEnv();

//. https://www.npmjs.com/package/@cloudant/cloudant
var Cloudantlib = require( '@cloudant/cloudant' );
var cloudant = null;
var db = null;

if( settings.db_username && settings.db_password ){
  cloudant = Cloudantlib( { account: settings.db_username, password: settings.db_password } );
}

if( cloudant ){
  cloudant.db.get( settings.db_name, function( err, body ){
    if( err ){
      if( err.statusCode == 404 ){
        cloudant.db.create( settings.db_name, function( err, body ){
          if( err ){
            db = null;
          }else{
            db = cloudant.db.use( settings.db_name );
            createDesignDocument();
          }
        });
      }else{
        db = cloudant.db.use( settings.db_name );
      }
    }else{
      db = cloudant.db.use( settings.db_name );
    }
  });
}

app.use( multer( { dest: './tmp/' } ).single( 'image' ) );
app.use( express.static( __dirname + '/public' ) );
app.use( bodyParser.urlencoded( { extended: true, limit: '10mb' } ) );
//app.use( bodyParser.urlencoded() );
app.use( bodyParser.json() );

app.post( '/doc', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  console.log( 'POST /doc' );
  //console.log( req.body );
  if( db ){
    var text = req.body.text;
    var path = req.file.path;
    var type = req.file.mimetype;
    var imgname = req.file.originalname;

    var bin = fs.readFileSync( path );
    var bin64 = new Buffer( bin ).toString( 'base64' );

    var doc = {};
    doc.created = doc.updated = ( new Date() ).getTime();
    doc.filename = imgname;
    doc.text = text;
    doc['_attachments'] = {
      file: {
        content_type : type,
        data: bin64
      }
    };

    db.insert( doc, function( err, body ){
      fs.unlink( path, function( e ){} );
      if( err ){
        res.status( 400 );
        res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
        res.end();
      }else{
        res.write( JSON.stringify( { status: true, message: body }, 2, null ) );
        res.end();
      }
    });
  }else{
    res.status( 400 );
    res.write( JSON.stringify( { status: false, message: 'db is failed to initialize.' }, 2, null ) );
    res.end();
  }
});

app.put( '/doc', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  console.log( 'PUT /doc' );
  //console.log( req.body );
  if( db ){
    if( req.body && req.body.id ){
      var id = req.body.id;
      db.get( id, { include_docs: true }, function( err, body ){
        if( err ){
          res.status( 400 );
          res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
          res.end();
        }else{
          console.log( body );

          var doc = body;   //. body.doc;
          var text = req.body.text;
          if( text ){
            doc.text = text;
          }
          doc.updated = ( new Date() ).getTime();

          if( req.file && req.file.path ){
            var path = req.file.path;
            var type = req.file.mimetype;
            var imgname = req.file.originalname;
            doc.filename = imgname;

            var bin = fs.readFileSync( path );
            var bin64 = new Buffer( bin ).toString( 'base64' );

            doc['_attachments'] = {
              file: {
                content_type : type,
                data: bin64
              }
            };
          }else{
          }

          db.insert( doc, function( err, body ){
            if( req.file && req.file.path ){
              fs.unlink( req.file.path, function( e ){} );
            }
            if( err ){
              res.status( 400 );
              res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
              res.end();
            }else{
              res.write( JSON.stringify( { status: true, message: body }, 2, null ) );
              res.end();
            }
          });
        }
      });
    }else{
      res.status( 400 );
      res.write( JSON.stringify( { status: false, message: 'parameter id missing.' }, 2, null ) );
      res.end();
    }
  }else{
    res.status( 400 );
    res.write( JSON.stringify( { status: false, message: 'db is failed to initialize.' }, 2, null ) );
    res.end();
  }
});

app.get( '/doc/:id', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  var id = req.params.id;
  console.log( 'GET /doc/' + id );
  if( db ){
    db.get( id, { include_docs: true }, function( err, body ){
      if( err ){
        res.status( 400 );
        res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
        res.end();
      }else{
        res.write( JSON.stringify( { status: true, doc: body }, 2, null ) );
        res.end();
      }
    });
  }else{
    res.status( 400 );
    res.write( JSON.stringify( { status: false, message: 'db is failed to initialize.' }, 2, null ) );
    res.end();
  }
});

app.get( '/revs/:id', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  var id = req.params.id;
  console.log( 'GET /revs/' + id );
  if( db ){
    db.get( id, { revs_info: true }, function( err, body ){
      if( err ){
        res.status( 400 );
        res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
        res.end();
      }else{
        if( body._revs_info ){
          var docs = [];
          var _id = body._id;
          var cnt = 0;
          var len = body._revs_info.length;
          body._revs_info.forEach( function( rev_info ){
            var _rev = rev_info.rev;
            db.get( _id, { include_docs: true, rev: _rev }, function( err, body ){
              cnt ++;
              if( err ){
              }else{
                docs.push( body );
              }

              if( cnt == len ){
                res.write( JSON.stringify( { status: true, docs: docs }, 2, null ) );
                res.end();
              }
            });
          });
        }else{
          res.status( 400 );
          res.write( JSON.stringify( { status: false, message: 'No _revs_info found.' }, 2, null ) );
          res.end();
        }
      }
    });
  }else{
    res.status( 400 );
    res.write( JSON.stringify( { status: false, message: 'db is failed to initialize.' }, 2, null ) );
    res.end();
  }
});

app.get( '/doc/:id/attachment', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  var id = req.params.id;
  console.log( 'GET /doc/' + id + '/attachment' );
  if( db ){
    db.get( id, { include_docs: true }, function( err, body ){
      if( err ){
        res.status( 400 );
        res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
        res.end();
      }else{
        //. body._attachments.(attachname) : { content_type: '', data: '' }
        if( body._attachments ){
          for( key in body._attachments ){
            var attachment = body._attachments[key];
            if( attachment.content_type ){
              res.contentType( attachment.content_type );
            }

            //. 添付画像バイナリを取得する
            db.attachment.get( id, key, function( err, buf ){
              if( err ){
                res.contentType( 'application/json; charset=utf-8' );
                res.status( 400 );
                res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
                res.end();
              }else{
                res.end( buf, 'binary' );
              }
            });
          }
        }else{
          res.status( 400 );
          res.write( JSON.stringify( { status: false, message: 'No attachment found.' }, 2, null ) );
          res.end();
        }
      }
    });
  }else{
    res.status( 400 );
    res.write( JSON.stringify( { status: false, message: 'db is failed to initialize.' }, 2, null ) );
    res.end();
  }
});

app.get( '/docs', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  console.log( 'GET /docs' );
  if( db ){
    db.list( { include_docs: true }, function( err, body ){
      if( err ){
        res.status( 400 );
        res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
        res.end();
      }else{
        var docs = [];
        body.rows.forEach( function( doc ){
          var _doc = JSON.parse(JSON.stringify(doc.doc));
          if( _doc._id.indexOf( '_' ) !== 0 ){
            docs.push( _doc );
          }
        });

        var result = { status: true, docs: docs };
        res.write( JSON.stringify( result, 2, null ) );
        res.end();
      }
    });
  }else{
    res.status( 400 );
    res.write( JSON.stringify( { status: false, message: 'db is failed to initialize.' }, 2, null ) );
    res.end();
  }
});

app.delete( '/doc/:id', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  var id = req.params.id;
  console.log( 'DELETE /doc/' + id );
  db.get( id, function( err, data ){
    if( err ){
      res.status( 400 );
      res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
      res.end();
    }else{
      db.destroy( id, data._rev, function( err, body ){
        if( err ){
          res.status( 400 );
          res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
          res.end();
        }else{
          res.write( JSON.stringify( { status: true }, 2, null ) );
          res.end();
        }
      });
    }
  });
});


/*
 You need to create search index 'design/search' with name 'newSearch' in your Cloudant DB before executing this API.
 */
app.get( '/search', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  console.log( 'GET /search' );
  if( db ){
    var q = req.query.q;
    if( q ){
      db.search( 'library', 'newSearch', { q: q, include_docs: true }, function( err, body ){
        if( err ){
          res.status( 400 );
          res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
          res.end();
        }else{
          res.write( JSON.stringify( { status: true, result: body }, 2, null ) );
          res.end();
        }
      });
    }else{
      res.status( 400 );
      res.write( JSON.stringify( { status: false, message: 'parameter: q is required.' }, 2, null ) );
      res.end();
    }
  }else{
    res.status( 400 );
    res.write( JSON.stringify( { status: false, message: 'db is failed to initialize.' }, 2, null ) );
    res.end();
  }
});


app.post( '/reset', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  console.log( 'POST /reset' );
  if( db ){
    db.list( {}, function( err, body ){
      if( err ){
        res.status( 400 );
        res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
        res.end();
      }else{
        var docs = [];
        body.rows.forEach( function( doc ){
          var _id = doc.id;
          if( _id.indexOf( '_' ) !== 0 ){
            var _rev = doc.value.rev;
            docs.push( { _id: _id, _rev: _rev, _deleted: true } );
          }
        });
        if( docs.length > 0 ){
          db.bulk( { docs: docs }, function( err ){
            res.write( JSON.stringify( { status: true, message: docs.length + ' documents are deleted.' }, 2, null ) );
            res.end();
          });
        }else{
          res.write( JSON.stringify( { status: true, message: 'No documents need to be deleted.' }, 2, null ) );
          res.end();
        }
      }
    });
  }else{
    res.status( 400 );
    res.write( JSON.stringify( { status: false, message: 'db is failed to initialize.' }, 2, null ) );
    res.end();
  }
});



function createDesignDocument(){
  var search_index_function = 'function (doc) { index( "default", doc._id ); }';
  if( settings.search_fields ){
    search_index_function = 'function (doc) { index( "default", ' + settings.search_fields + '.join( " " ) ); }';
  }

  //. デザインドキュメント作成
  var design_doc = {
    _id: "_design/library",
    language: "javascript",
    views: {
      bycreated: {
        map: "function (doc) { if( doc.created ){ emit(doc.created, doc); } }"
      },
      byupdated: {
        map: "function (doc) { if( doc.updated ){ emit(doc.updated, doc); } }"
      }
    },
    indexes: {
      newSearch: {
        "analyzer": settings.search_analyzer,
        "index": search_index_function
      }
    }
  };
  db.insert( design_doc, function( err, body ){
    if( err ){
      console.log( "db init: err" );
      console.log( err );
    }else{
      //console.log( "db init: " );
      //console.log( body );
    }
  } );
}


var port = settings.app_port || appEnv.port || 3000;
app.listen( port );
console.log( 'server started on ' + port );
