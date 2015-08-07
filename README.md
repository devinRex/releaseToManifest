# releaseToManifest
基于fis的二次开发，根据配置自动生成manifest文件

使用前的配置：
1.需要安装两个nodejs的模块cheerio、sync-request：

	npm install cheerio

	npm install sync-request
   

2.mobiledev下fis-conf.js的修改，增加：

    fis.config.set("manifest",{

		//要写入的manifest文件名
	    path :"index.manifest",  

	    //所有文件的路径
	    filesPath: "../mobile/", 

	    //要做离线缓存的页面
	    files :["index.html","modules/truck/index.html","modules/truck/teams.html",
	    "modules/truck/drivers.html","modules/truck/organ-setting.html","about.html"],

	    //一些要特殊补充的内容
	    shim:["modules/truck/index.html?v=1.0"]
	});

3.mobiledev下fis-conf.js的修改，发布路由的修改，直接复制如下内容替换以前的配置：

	fis.config.set('roadmap.path',[

    {
        reg: /^\/lib\/css\/(.*)/i,
        release: '/lib/css/$1',
        url : 'lib/css/$1'
    },

    {
        reg: /^\/css\/(.*)/i,
        release: '/css/$1',
        url : 'css/$1'
    },

    {
        reg: /^\/js\/webankfaq\.js/i,
        release: '/js/webankfaq.js',
        url : 'js/webankfaq.js'
    },

    {
        reg: /^\/lib\/js\/(.*)/i,
        release: '/lib/js/$1',
        url : 'lib/js/$1'
    },

    {
        reg: /^\/lib\/img\/gototop\.png/i,
        release: 'lib/img/gototop.png',
        url : 'lib/img/gototop.png'
    },

    {
        reg: /^\/lib\/img\/page\/(.*)/i,
        release: '/lib/img/page/$1',
        url : '../lib/img/page/$1'
    },

    //所有lib/css中的背景图片路径
    {
        reg: /^\/lib\/img\/(.*)/i,
        release: '/lib/img/$1',
        url : '../img/$1'
    }

	]);
	
使用命令：

	fis release -d mobile -p -M 