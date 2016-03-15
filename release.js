/*
 * fis
 * http://fis.baidu.com/
 */

'use strict';

exports.name = 'release';
exports.desc = 'build and deploy your project';
exports.register = function(commander){
    
    function watch(opt){
        var root = fis.project.getProjectPath();
        var timer = -1;
        var safePathReg = /[\\\/][_\-.\s\w]+$/i;
        var ignoredReg = /[\/\\](?:output\b[^\/\\]*([\/\\]|$)|\.|fis-conf\.js$)/i;
        opt.srcCache = fis.project.getSource();
        function listener(type){
            return function (path) {
                if(safePathReg.test(path)){
                    var file = fis.file.wrap(path);
                    if (type == 'add' || type == 'change') {
                        if (!opt.srcCache[file.subpath]) {
                            var file = fis.file(path);
                            opt.srcCache[file.subpath] = file;
                        }
                    } else if (type == 'unlink') {
                        if (opt.srcCache[file.subpath]) {
                            delete opt.srcCache[file.subpath];
                        }
                    } else if (type == 'unlinkDir') {
                         fis.util.map(opt.srcCache, function (subpath, file) {
                            if (file.realpath.indexOf(path) !== -1) {
                                delete opt.srcCache[subpath];
                            }
                        });                       
                    }
                    clearTimeout(timer);
                    timer = setTimeout(function(){
                        release(opt);
                    }, 500);
                }
            };
        }

        //添加usePolling配置
        var usePolling = null;

        if (typeof fis.config.get('project.watch.usePolling') !== 'undefined'){
            usePolling = fis.config.get('project.watch.usePolling');
        }

        require('chokidar')
            .watch(root, {
                ignored : function(path){
                    var ignored = ignoredReg.test(path);
                    if (fis.config.get('project.exclude')){
                        ignored = ignored ||
                            fis.util.filter(path, fis.config.get('project.exclude'));
                    }
                    if (fis.config.get('project.watch.exclude')){
                        ignored = ignored ||
                            fis.util.filter(path, fis.config.get('project.watch.exclude'));
                    }
                    return ignored;
                },
                usePolling: usePolling,
                persistent: true
            })
            .on('add', listener('add'))
            .on('change', listener('change'))
            .on('unlink', listener('unlink'))
            .on('unlinkDir', listener('unlinkDir'))
            .on('error', function(err){
                //fis.log.error(err);
            });
    }
    
    function time(fn){
        process.stdout.write('\n δ '.bold.yellow);
        var now = Date.now();
        fn();
        process.stdout.write((Date.now() - now + 'ms').green.bold);
        process.stdout.write('\n');
    }
    
    var LRServer, LRTimer;
    function reload(){
        if(LRServer && LRServer.connections) {
            fis.util.map(LRServer.connections, function(id, connection){
                try {
                    connection.send({
                        command: 'reload',
                        path: '*',
                        liveCSS: true
                    });
                } catch (e) {
                    try {
                        connection.close();
                    } catch (e) {}
                    delete LRServer.connections[id];
                }
            });
        }
    }
    
    var lastModified = {};
    var collection = {};
    var total = {};
    var deploy = require('./lib/deploy.js');
    
    deploy.done = function(){
        clearTimeout(LRTimer);
        LRTimer = setTimeout(reload, 200);
    };
    
    function release(opt){
        var flag, cost, start = Date.now();
        process.stdout.write('\n Ω '.green.bold);
        opt.beforeEach = function(file){
            flag = opt.verbose ? '' : '.';
            cost = (new Date).getTime();
            total[file.subpath] = file;
        };
        opt.afterEach = function(file){
            //cal compile time
            cost = (new Date).getTime() - cost;
            if(cost > 200){
                flag = flag.bold.yellow;
                fis.log.debug(file.realpath);
            } else if(cost < 100){
                flag = flag.grey;
            }
            var mtime = file.getMtime().getTime();
            //collect file to deploy
            if(file.release && lastModified[file.subpath] !== mtime){
                if(!collection[file.subpath]){
                    process.stdout.write(flag);
                }
                lastModified[file.subpath] = mtime;
                collection[file.subpath] = file;
            }
        };
        
        opt.beforeCompile = function(file){
            collection[file.subpath] = file;
            process.stdout.write(flag);
        };
        
        try {
            //release
            fis.release(opt, function(ret){
                process.stdout.write(
                    (opt.verbose ? '' : ' ') +
                    (Date.now() - start + 'ms').bold.green + '\n'
                );
                var changed = false;
                fis.util.map(collection, function(key, file){
                    //get newest file from src
                    collection[key] = ret.src[key] || file;
                    changed = true;
                });
                if (changed){
                    if(opt.unique){
                        time(fis.compile.clean);
                    }
                    fis.util.map(ret.pkg, function(subpath, file){
                        collection[subpath] = file;
                        total[subpath] = file;
                    });
                    deploy(opt, collection, total);
                    collection = {};
                    total = {};
                    return;
                }
            });
        } catch(e) {
            process.stdout.write('\n [ERROR] ' + (e.message || e) + '\n');
            if(opt.watch){
                process.stdout.write('\u0007');
            } else if(opt.verbose) {
                throw e;
            } else {
                process.exit(1);
            }
        }
    }
    
    commander
        .option('-d, --dest <names>', 'release output destination', String, 'preview')
        .option('-m, --md5 [level]', 'md5 release option', Number)
        .option('-D, --domains', 'add domain name', Boolean, false)
        .option('-l, --lint', 'with lint', Boolean, false)
        .option('-t, --test', 'with unit testing', Boolean, false)
        .option('-o, --optimize', 'with optimizing', Boolean, false)
        .option('-p, --pack', 'with package', Boolean, true)
        .option('-w, --watch', 'monitor the changes of project')
        .option('-L, --live', 'automatically reload your browser')
        .option('-c, --clean', 'clean compile cache', Boolean, false)
        .option('-r, --root <path>', 'set project root')
        .option('-f, --file <filename>', 'set fis-conf file')
        .option('-u, --unique', 'use unique compile caching', Boolean, false)
        .option('--verbose', 'enable verbose output', Boolean, false)
        //.option('-M, --manifest <file>', 'generate manifest file')
        .option('-M, --manifest', 'generate manifest file')
        .action(function(){

            var options = arguments[arguments.length - 1];

            fis.log.throw = true;

            //configure log
            if(options.verbose){
                fis.log.level = fis.log.L_ALL;
            }
            var root, conf, filename = 'fis-conf.js';
            if(options.file){
                if(fis.util.isFile(options.file)){
                    conf = fis.util.realpath(options.file);
                } else {
                    fis.log.error('invalid fis config file path [' + options.file + ']');
                }
            }
            if(options.root){
                root = fis.util.realpath(options.root);
                if(fis.util.isDir(root)){
                    if(!conf && fis.util.isFile(root + '/' + filename)){
                        conf = root + '/' + filename;
                    }
                    delete options.root;
                } else {
                    fis.log.error('invalid project root path [' + options.root + ']');
                }
            } else {
                root = fis.util.realpath(process.cwd());
                if(!conf){
                    //try to find fis-conf.js
                    var cwd = root, pos = cwd.length;
                    do {
                        cwd  = cwd.substring(0, pos);
                        conf = cwd + '/' + filename;
                        if(fis.util.exists(conf)){
                            root = cwd;
                            break;
                        } else {
                            conf = false;
                            pos = cwd.lastIndexOf('/');
                        }
                    } while(pos > 0);
                }
            }
            
            //init project
            fis.project.setProjectRoot(root);
            
            process.title = 'fis ' + process.argv.splice(2).join(' ') + ' [ ' + root + ' ]';
            
            if(conf){
                var cache = fis.cache(conf, 'conf');
                if(!cache.revert()){
                    options.clean = true;
                    cache.save();
                }
                require(conf);
            } else {
                fis.log.warning('missing config file [' + filename + ']');
            }
            
            if(options.clean){
                time(function(){
                    fis.cache.clean('compile');
                });
            }
            delete options.clean;
            
            //domain, fuck EventEmitter
            if(options.domains){
                options.domain = true;
                delete options.domains;
            }
            
            if(options.live){
                var LiveReloadServer = require('livereload-server-spec');
                var port = fis.config.get('livereload.port', 8132);
                LRServer = new LiveReloadServer({
                    id: 'com.baidu.fis',
                    name: 'fis-reload',
                    version : fis.cli.info.version,
                    port : port,
                    protocols: {
                        monitoring: 7
                    }
                });
                LRServer.on('livereload.js', function(req, res) {
                    var script = fis.util.fs.readFileSync(__dirname + '/vendor/livereload.js');
                    res.writeHead(200, {
                        'Content-Length': script.length,
                        'Content-Type': 'text/javascript',
                        'Connection': 'close'
                    });
                    res.end(script);
                });
                LRServer.listen(function(err) {
                    if (err) {
                        err.message = 'LiveReload server Listening failed: ' + err.message;
                        fis.log.error(err);
                    }
                });
                process.stdout.write('\n Ψ '.bold.yellow + port + '\n');
                //fix mac livereload
                process.on('uncaughtException', function (err) {
                    if(err.message !== 'read ECONNRESET') throw  err;
                });
                //delete options.live;
            }
            
            switch (typeof options.md5){
                case 'undefined':
                    options.md5 = 0;
                    break;
                case 'boolean':
                    options.md5 = options.md5 ? 1 : 0;
                    break;
                default :
                    options.md5 = isNaN(options.md5) ? 0 : parseInt(options.md5);
            }
            //md5 > 0, force release hash file
            options.hash = options.md5 > 0;
            
            if(options.watch){
                watch(options);
            } else {
                release(options);
            }
            // 修改manifest文件
            if(options.manifest){
                // 获取manifest文件路径
                //var manifest = fis.util.realpath(options.manifest);
                var manifest;
                //依赖模块
                var fs=require('fs');
                var cheerio = require("cheerio");
                var request = require("sync-request");
                var createMani = {
                    mfArgs: null,    //fis.conf 里manifest配置的参数
                    mfFiles: [],     //fis.conf 里manifest配置的参数files
                    mfFileCont: {},  //资源数组
                    publicCont: {},  //公用资源数组
                    newHtml: {},     //
                    init: function () {
                        var t = this;
                        t.mfArgs = fis.config.get("manifest");
                        t.filePath = t.mfArgs.filesPath;
                        t.mfFiles = t.mfArgs.files;
                        t.ignore = t.mfArgs.ignore;
                        manifest = fis.util.realpath(t.filePath + t.mfArgs.path);
                        //先拿js、css与页面内的img元素
                        for (var i = 0, len = t.mfFiles.length; i < len; i ++) {
                            (function (i) {
                                //.log(fis.util.realpath(t.filePath + t.mfFiles[i]));
                                var data = fs.readFileSync(fis.util.realpath(t.filePath + t.mfFiles[i] + ""), 'utf8');
                                // console.log(data);
                                var $ = cheerio.load(data,{decodeEntities: false}),
                                    Scripts = $('script'),
                                    Links = $("link"),
                                    Imgs = $("img");
                                    //console.log($.html());
                                    /*
                                    todo 在config里加上ignore选项，添加要移除的js资源文件
                                    */
                                    if(t.ignore) {
                                        for(var  j = 0, jLen = t.ignore.length; j < jLen; j++) {
                                            Scripts.each( function () {
                                                if($(this).attr("src") == t.ignore[j]) {
                                                    $(this).remove();
                                                    t.newHtml[t.mfFiles[i]] = {
                                                        fileIndex: i,
                                                        html: $.html()
                                                    }
                                                }
                                            });
                                        }
                                    }
                                    Scripts = $('script');
                                    // Scripts.each(function () {
                                    //     if($(this).attr("src") == "lib/js/md5.min.js" || $(this).attr("src") == "lib/js/get-sign.js"){
                                    //         $(this).remove();
                                    //         //console.log($.html());
                                    //         t.newHtml = $.html();
                                    //     }
                                    // });
                                    
                                //获取script
                                t.getResource({
                                    resource: Scripts,
                                    reType: "js",
                                    index: i
                                });
                                //获取img
                                t.getResource({
                                    resource: Imgs,
                                    reType: "img",
                                    index: i
                                });
                                //获取css,拿到css文件后，需要遍历css拿bg和font
                                t.getResource({
                                    resource: Links,
                                    reType: "css",
                                    index : i
                                });
                            })(i);
                        }
                        //console.log(t.mfFileCont);

                        //去重并提取公用
                        t.processCont();
                        //console.log(t.mfFileCont);

                        //去重和提取公有后，通过css去拿bg与font
                        (function () {
                            for(var m in t.mfFileCont) {
                                if(t.mfFileCont.hasOwnProperty(m)) {
                                    var curCont = t.mfFileCont[m]; //当前是哪个页面的缓存目录
                                    var cssList = curCont["css"];
                                    if(cssList.length > 0) {
                                        for (var j = 0, len = cssList.length; j < len; j++) {
                                            (function (j) {
                                                if(cssList[j].length > 0) {
                                                    //如果是本地路径，直接读
                                                    if(cssList[j].indexOf("http://") === -1) {
                                                        var data = fs.readFileSync(fis.util.realpath(t.filePath+cssList[j])+"", 'utf8');
                                                        //console.log(t.getCssBg(data));
                                                        curCont["bg"] = curCont["bg"].concat(t.getCssBg(data));
                                                    } else { //远程路径需要去get
                                                        var data2 = request('GET', cssList[j]);
                                                        //data2 = String.fromCharCode.apply(null, new Uint16Array(data2.getBody('utf8')));
                                                        data2 = data2.getBody('utf8');
                                                        curCont["bg"] = curCont["bg"].concat(t.getCssBg(data2));
                                                    }
                                                }
                                            })(j);
                                        }
                                    }
                                }
                            }
                        })();
                        //console.log(t.mfFileCont);
                        t.processAlone("bg", function () {
                            for(var i in t.mfFileCont){
                                t.mfFileCont[i].img = t.mfFileCont[i].img.concat(t.mfFileCont[i].bg);
                                delete t.mfFileCont[i].bg;
                            }
                        });
                        //console.log(t.mfFileCont);
                        t.processAlone("img");
                        //写manifest
                        t.mfWrite();


                    },
                    /**
                     * 通过css文件去拿font和bg
                     * @param data  读css文件产生的字符串
                     * @returns {Array} 返回取得的资源数组
                     */
                    getCssBg: function (data) {
                        var cssBgReg = /url\(([^\)]*?(?:png|jpg|gif|woff|ttf)[^\)]*)\)/ig;
                        //这里因为g下的RegExp的exec方法会维护lastIndex，暂时没想到使用一个RegExp的方法
                        var cssExec = /url\(([^\)]*?(?:png|jpg|gif|woff|ttf)[^\)]*)\)/;
                        var results = data.match(cssBgReg);
                        var addImgArr = [];   //存储正则拿到的字体和图片路径（已转成相对根目录的路径）
                        var execRe;
                        //console.log(results);
                        if(results != null) {
                            for(var k = 0, kLen = results.length; k < kLen; k++ ) {
                                //屏蔽base64
                                if(results[k] && results[k].indexOf("base64") === -1) {
                                    execRe = cssExec.exec(results[k]);
                                    //console.log(execRe);
                                    //css有两个路径，将里面的背景图片路径统一改为lib/img/XXX
                                    execRe && addImgArr.push(execRe[1].replace(/['"]?([^'"]+)['"]?/g, "$1").replace(/\.\.\/img/,"lib/img").replace(/\.\.\/lib/,"lib"));
                                }
                                    
                            }
                        }
                        return addImgArr;
                    },
                    /**
                     * 拿资源文件
                     * @param options
                     * options: {
                     *   reType: js/css/img,
                     *   resource: 资源对象,
                     *   callbacks: 回调
                     *   index
                     * }
                     */
                    getResource: function(options){
                        var reTypeAttrObj = {
                            js: "src",
                            img: 'src',
                            css: 'href'
                        };
                        var reType = options.reType,            //哪种资源
                            resource = options.resource,        //资源列表
                            reTypeAttr = reTypeAttrObj[reType], //获取的资源属性
                            callback = options.callback,
                            index = options.index;
                        var mfFileCont = this.mfFileCont,
                            mfFiles = this.mfFiles;
                        for (var j = 0, jLen = resource.length; j < jLen; j++) {
                            mfFileCont[mfFiles[index]] || (mfFileCont[mfFiles[index]] = {
                                js: [],
                                css: [],
                                img: [],
                                bg: []
                            });
                            if(resource[j] && resource[j].attribs[reTypeAttr]) {
                                //屏蔽base64
                                if(!(reType === "img" && resource[j].attribs[reTypeAttr].indexOf("base64") !== -1)){
                                    mfFileCont[mfFiles[index]][reType].push(resource[j].attribs[reTypeAttr]);
                                }
                            }
                        }
                        callback && callback();
                    },
                    /**
                     * 对资源数组进行去重与提取公用
                     * @param reType 要处理的资源类型
                     * @param callback
                     */
                    processAlone: function (reType, callback) {
                        var t = this;
                        var mfFileCont = t.mfFileCont;
                        var totalType = [];
                        for ( var i in mfFileCont) {

                            if (mfFileCont.hasOwnProperty(i)) {

                                mfFileCont[i][reType] = t.contUnique(mfFileCont[i][reType]).result;

                                if( i != "publicCont") {
                                    totalType.push(mfFileCont[i][reType]);
                                }
                            }
                        }

                        totalType = [].concat.apply([], totalType);
                        //对合并的数组去重
                        //console.log(totalType);

                        var reTypeUni = t.contUnique(totalType);
                        //公用部分设置
                        t.publicCont[reType] = t.contUnique(t.publicCont[reType].concat(reTypeUni.repeatArr)).result;

                        callback && callback();
                    },
                    /**
                     * 处理读到的数据，去重并提取公用
                     */
                    processCont: function () {
                        var t = this;
                        var mfFileCont = t.mfFileCont;
                        var totalCss = [],
                            totalJs = [],
                            totalImg = [];
                        //各个资源数组单独去重并合并以准备提取公用
                        for ( var i in mfFileCont) {
                            if (mfFileCont.hasOwnProperty(i)) {
                                mfFileCont[i].css = t.contUnique(mfFileCont[i].css).result;
                                mfFileCont[i].js = t.contUnique(mfFileCont[i].js).result;
                                mfFileCont[i].img = t.contUnique(mfFileCont[i].img).result;
                                totalCss.push(mfFileCont[i].css);
                                totalJs.push(mfFileCont[i].js);
                                totalImg.push(mfFileCont[i].img);
                            }
                        }
                        //提取公用部分
                        totalCss = [].concat.apply([], totalCss);
                        totalJs = [].concat.apply([], totalJs);
                        totalImg = [].concat.apply([], totalImg);
                        var reCss = t.contUnique(totalCss);
                        var reJs = t.contUnique(totalJs);
                        var reImg = t.contUnique(totalImg);
                        t.publicCont["css"] = reCss.repeatArr;
                        t.publicCont["js"] = reJs.repeatArr;
                        t.publicCont["img"] = reImg.repeatArr;
                        t.publicCont["bg"] = [];
                        //从原资源数组中移除公用部分
                        for ( var i in mfFileCont) {
                            if (mfFileCont.hasOwnProperty(i)) {
                                mfFileCont[i].css = t.removePublic(mfFileCont[i].css, t.publicCont["css"]);
                                mfFileCont[i].img = t.removePublic(mfFileCont[i].img, t.publicCont["img"]);
                                mfFileCont[i].js = t.removePublic(mfFileCont[i].js, t.publicCont["js"]);
                            }
                        }
                        //这里其实已经改了指向 改变t.publicCont就是改变mfFileCont.publicCont;
                        mfFileCont.publicCont = t.publicCont;
                    },
                    /**
                     * 数组去重
                     * @param arr 要去重的数组
                     * @returns {{result: Array, repeatArr: Array}} result：去重后的数组， repeatArr: 重复的数据
                     */
                    contUnique: function(arr) {
                        var result = [], hash = {}, repeatArr = [],repeatHash = {};
                        if(arr.length > 0) {
                            for (var i = 0, elem; (elem = arr[i]) != null; i++) {
                                if (!hash[elem]) {
                                    result.push(elem);
                                    hash[elem] = true;
                                } else {
                                    if(!repeatHash[elem]) {
                                        repeatArr.push(elem);
                                        repeatHash[elem] = true;
                                    }
                                }
                            }
                        }
                        return {
                            result: result,
                            repeatArr: repeatArr
                        };

                    },
                    /**
                     * 删除数组里的某些元素
                     * @param oArr  要处理的数组
                     * @param reArr 要删除的元素数组
                     */
                    removePublic: function (oArr, reArr) {
                        var index;
                        for(var i = 0, len = reArr.length; i < len; i++) {
                            if((index = oArr.indexOf(reArr[i])) !== -1) {
                                oArr = oArr.slice(0, index).concat(oArr.slice(index+1, oArr.length))
                            }

                        }
                        return oArr;
                    },
                    /*
                     写mf文件
                     */
                    mfWrite: function () {
                        var t = this;
                        var mfFileCont = t.mfFileCont;
                        var mfFileContStr = "";
                        for( var i in mfFileCont) {
                            if(mfFileCont.hasOwnProperty(i)) {
                                mfFileContStr += "\n#" + i.replace(/modules/, "") +"\n";
                                if(i !== "publicCont"){
                                    mfFileContStr += i + "\n";
                                }
                                if(mfFileCont[i].css.length > 0) {
                                    mfFileContStr += mfFileCont[i].css.join('\n') + "\n";
                                }
                                if(mfFileCont[i].js.length > 0){
                                    mfFileContStr += mfFileCont[i].js.join('\n') + "\n";
                                }
                                if(mfFileCont[i].img.length > 0) {
                                    mfFileContStr += mfFileCont[i].img.join('\n') + "\n";
                                }
                            }
                        }
                        var shim = fis.config.get("manifest").shim;
                        mfFileContStr += "\n#shim\n";
                        if( shim && shim.length >0) {
                            for(var j = 0, jLen = shim.length; j < jLen; j++) {
                                mfFileContStr += shim[j] + "\n";
                            }
                        }
                        //如果manifest文件不存在
                        if(manifest === false){
                            fs.open(t.filePath + t.mfArgs.path,"w",function(e,fd){
                                if(e) throw e;
                                var prefix = "CACHE MANIFEST\n#"+new Date().toGMTString()+"\n\n";
                                // 拼接新的文件内容

                                var newContent = prefix+mfFileContStr+"\nNETWORK: \n*";
                                console.log(newContent);
                                //manifest = fis.util.realpath(t.filePath + t.mfArgs.path);
                                //写入文件
                                fs.writeFile(t.filePath + t.mfArgs.path, newContent, function(err) {
                                    if(err) {
                                        return console.log(err);
                                    }
                                    console.log('generate manifest file done');
                                });
                            });
                        } else {
                            // 生成新的时间戳
                            var prefix = "CACHE MANIFEST\n#"+new Date().toGMTString()+"\n\n";
                            // 拼接新的文件内容

                            var newContent = prefix+mfFileContStr+"\nNETWORK:\n*";
                            console.log(newContent);

                            //写入文件
                            fs.writeFile(manifest, newContent, function(err) {
                                if(err) {
                                    return console.log(err);
                                }
                                console.log('generate manifest file done');
                            });
                        }
                        ////读取文件
                        //fs.readFile(manifest,'utf8',function(err,data){
                        //    if(err){
                        //        return console.log(err);
                        //    }
                        //    // 按照特征字符获取时间戳
                        //    var start = data.indexOf("CACHE MANIFEST");
                        //    var end = data.indexOf("CACHE:");


                        //})
                        //写新的index.html
                        //console.log(t.newHtml);

                        for(var j in t.newHtml) {
                            console.log(j);
                            fs.writeFile(fis.util.realpath(t.filePath + t.mfFiles[t.newHtml[j].fileIndex] + ""), t.newHtml[j].html, function(err) {
                            if(err) {
                                return console.log(err);
                            }
                            console.log('remove ignore file done');
                            });
                        };
                        // console.log(fis.util.realpath(t.filePath + t.mfFiles[0] + ""));
                        // fs.writeFile(fis.util.realpath(t.filePath + t.mfFiles[0] + ""), t.newHtml, function(err) {
                        //         if(err) {
                        //             return console.log(err);
                        //         }
                        //         console.log('generate manifest file done');
                        //     });
                    }
                };
                //createMani.init();
                deploy.done = function(){
                    createMani.init();
                };

            }
        });
};
