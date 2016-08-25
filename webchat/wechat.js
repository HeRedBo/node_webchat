'use strict'

var Promise = require('bluebird');
var _ = require('lodash');
var request = Promise.promisify(require('request'));
var fs      = require('fs');
var util    = require('./util');
var prefix  = 'https://api.weixin.qq.com/cgi-bin/';
var api     = {
    accessToken : prefix + 'token?grant_type=client_credential',
    temporary : {
        upload : prefix + 'media/upload?',
        fetch : prefix + 'media/get?',
    },
    permanent : {
        upload        : prefix + 'material/add_material?',
        fetch         : prefix + 'material/get_material?',
        uploadNews    : prefix + 'material/add_news?',  // 图文素材
        uploadNewsPic : prefix + 'media/uploadimg?',    //
        del           : prefix + 'material/del_material?',// 删除永久素材
        update        : prefix + 'material/update_news?',// 修改永久素材
        count         : prefix + 'material/get_materialcount?',
        batch         : prefix + 'material/batchget_material?',
    },
    tags :  {
        create  : prefix +  'tags/create?',
        fetch   : prefix +  'tags/get?',
        update  : prefix +  'tags/update?',
        del     : prefix +  'tags/delete?',
        fetchTagUsers : prefix +  'user/tag/get?',
        batchtag      : prefix +  'tags/members/batchtagging?',
        batchuntag    : prefix +  'tags/members/batchuntagging?',
        getidlist     : prefix +  'tags/getidlist?',
    },

};

function Wechat(opts) {
    var that             = this;
    this.appID           = opts.appID;
    this.appSecret       = opts.appSecret;
    this.getAccessToken  = opts.getAccessToken;
    this.saveAccessToken = opts.saveAccessToken;
    this.fetchAccessToken();
}

Wechat.prototype.fetchAccessToken = function(data){
    var that = this;
    if(this.access_token && this.expires_in) {
        if(this.isValidAccessToken(this)) {
            return new Promise.resolve(this);
        }
    }
    this.getAccessToken ()
        .then(function(data){
            try {
                data = JSON.parse(data);
            } catch(e) {
                return that.updateAccessToken();
            }

            if(that.isValidAccessToken(data)) {
                return new Promise.resolve(data);
            } else {
                return that.updateAccessToken();
            }
        })
        .then(function(data) {
            that.access_token = data.access_token;
            that.expires_in   = data.expires_in;
            that.saveAccessToken(data);
            return new Promise.resolve(data);
        });
}

Wechat.prototype.isValidAccessToken = function(data){

    if(!data || !data.access_token || !data.expires_in) {
        return false;
    }
    var access_token = data.access_token;
    var expires_in   = data.expires_in;
    var now          = (new Date().getTime());
    if(now < expires_in) {
        return true;
    } else {
        return false;
    }
}

Wechat.prototype.updateAccessToken = function() {
    var appID = this.appID;
    var appSecret = this.appSecret;
    var url = api.accessToken + '&appid=' + appID + '&secret=' + appSecret;
    return new Promise(function(resolve, reject) {
        request({url:url,json:true}).then(function(response){
            var data = response.body;
            var now = (new Date().getTime());
            var expires_in = now + (data.expires_in - 10) * 1000;
            data.expires_in = expires_in;
            resolve(data);
        });
    });
}

Wechat.prototype.reply = function() {
    var content = this.body;
    var message = this.weixin;
    var xml = util.tpl(content,message);
    this.status = 200;
    this.type   = 'application/xml';
    this.body   = xml;
}

Wechat.prototype.uploadMatertial = function(type, material, permanent) {
    var that = this;
    var form = {};
    var uploadUrl = api.temporary.upload;
    if(permanent) {
        uploadUrl = api.permanent.upload;
        _.extend(form, permanent); // 为了使用兼容所有的上次类型
    }

    if(type === 'pic') { //图文消息要上传的图片
        uploadUrl = api.permanent.uploadNewsPic;
    }
    if(type === 'news') {
        uploadUrl = api.permanent.uploadNews;
        form      = material;
    } else {
        form.media =  fs.createReadStream(material);
    }
    return new Promise(function(resolve, reject) {
        that
        .fetchAccessToken()
        .then(function(data) {
            var url = uploadUrl + 'access_token=' + data.access_token;
            if(!permanent) {
                url += '&type=' + type;
            } else {
                form.access_token = data.access_token;
            }
            var options = {
                method : 'POST',
                url : url,
                json:true,
            }

            if(type ==='news') {
                options.body = form;
            } else {
                options.formData = form;
            }
            console.log(options);
            console.log('options');
            request(options)
            .then(function(response){
                var _data = response.body;
                if(_data) {
                    resolve(_data);
                } else{
                    throw new Error('uplaod Matertial fails');
                }
            })
            .catch(function(err){
                reject(err);
            });
        });
    });
}

Wechat.prototype.deleteMatertial = function(mediaId) {
    var that = this;
    var form = {
        media_id : mediaId
    };

    return new Promise(function(resolve, reject) {
        that
        .fetchAccessToken()
        .then(function(data) {
            var url = api.permanent.del + 'access_token=' + data.access_token + '&media_id=' + mediaId;

            request({method: 'POST', url:url, body: form, json:true})
                .then(function(response){
                    var _data = response.body;
                    if(_data) {
                        resolve(_data);
                    } else{
                        throw new Error('delete Matertial fails');
                    }
            })
            .catch(function(err){
                reject(err);
            });
        });
    });
}

Wechat.prototype.updateMatertial = function(mediaId,news) {
    var that = this;
    var form = {
        media_id : mediaId
    };
    _.extend(form,news);

    return new Promise(function(resolve, reject) {
        that
        .fetchAccessToken()
        .then(function(data) {
            var url = api.permanent.update + 'access_token=' + data.access_token + '&media_id=' + mediaId;
            request({ method: 'POST', url:url, body:form, json:true})
                .then(function(response){
                    var _data = response.body;
                    if(_data) {
                        resolve(_data);
                    } else{
                        throw new Error('update Matertial fails');
                    }
            })
            .catch(function(err){
                reject(err);
            });
        });
    });
}

Wechat.prototype.fetchMatertial = function(mediaId, type, permanent) {
    var that = this;
    var form = {};
    var fetchUrl = api.temporary.fetch;
    if(permanent) {
        fetchUrl = api.permanent.fetch;
    }
    return new Promise(function(resolve, reject) {
        that
        .fetchAccessToken()
        .then(function(data) {
            var url = fetchUrl + 'access_token=' + data.access_token;
            var form = {};
            var options = {method:'POST',url:url,json:true}
            if(permanent) {

                form.media_id = mediaId;
                form.access_token = data.access_token;
                options.body = form;
            } else {
                if(type === 'video') {
                    url = url.replace('https//','http://');
                }
                url += '&media_id=' + mediaId
            }

            if(type === 'news' || type ==='video') {
                request(options).then(function(response){
                    var _data = response.body;
                    if(_data) {
                        resolve(_data);
                    } else{
                        throw new Error('fetch Matertial fails');
                    }
                })
                .catch(function(err){
                    reject(err);
                });
            } else {
                resolve(url);
            }
        })
        .catch(function(err){
                reject(err);
        });
    });
}

/** 获取资源的数量 **/
Wechat.prototype.countMatertial = function() {
    var that = this;
    return new Promise(function(resolve, reject) {
        that.fetchAccessToken()
        .then(function(data) {
            var url = api.permanent.count + 'access_token=' + data.access_token;
            request({ method: 'GET', url:url,json:true})
                .then(function(response){
                    var _data = response.body;
                    if(_data) {
                        resolve(_data);
                    } else{
                        throw new Error('get Matertial Counts fails');
                    }
            })
            .catch(function(err){
                reject(err);
            });
        });
    });
}

/** 获取素材的数量 **/
Wechat.prototype.batchMatertial = function(options) {
    var that = this;
    options.type  = options.type   || 'image';
    options.offet = options.offset || 0;
    options.count = options.count  || 5;
    return new Promise(function(resolve, reject) {
        that.fetchAccessToken()
        .then(function(data) {
            var url = api.permanent.batch + 'access_token=' + data.access_token;
            request({ method: 'POST', url:url, body: options,json:true})
                .then(function(response){
                    var _data = response.body;
                    if(_data) {
                        resolve(_data);
                    } else{
                        throw new Error('batch Matertial lists fails');
                    }
            })
            .catch(function(err){
                reject(err);
            });
        });
    });
}

/** 创建用户标签 **/
Wechat.prototype.createTags = function(name) {
    var that = this;
    return new Promise(function(resolve, reject) {
        that.fetchAccessToken()
        .then(function(data) {
            var options = {
                tag : {
                    name : name,
                }
            }
            var url = api.tags.create + 'access_token=' + data.access_token;
            request({ method: 'POST', url:url, body: options,json:true})
                .then(function(response){
                    var _data = response.body;
                    if(_data) {
                        resolve(_data);
                    } else{
                        throw new Error('create tag fails');
                    }
            })
            .catch(function(err){
                reject(err);
            });
        });
    });
}

/** 获取已经创建好的用户标签 **/
Wechat.prototype.fetchTags = function() {
    var that = this;
    return new Promise(function(resolve, reject) {
        that.fetchAccessToken()
        .then(function(data) {
            var url = api.tags.fetch + 'access_token=' + data.access_token;
            request({url:url,json:true})
                .then(function(response){
                    var _data = response.body;
                    if(_data) {
                        resolve(_data);
                    } else{
                        throw new Error('fetch tags fails');
                    }
            })
            .catch(function(err){
                reject(err);
            });
        });
    });
}

/**编辑用户标签 **/
Wechat.prototype.updateTag = function(tagId,name) {
    var that = this;
    return new Promise(function(resolve, reject) {
        that.fetchAccessToken()
        .then(function(data) {
            var options = {
                tag : {
                    id : tagId,
                    name : name,
                }
            }
            var url = api.tags.update + 'access_token=' + data.access_token;
            request({ method: 'POST', url:url, body: options,json:true})
                .then(function(response){
                    var _data = response.body;
                    if(_data) {
                        resolve(_data);
                    } else{
                        throw new Error('update tag fails');
                    }
            })
            .catch(function(err){
                reject(err);
            });
        });
    });
}

/** 获取已经创建好的用户标签 **/
Wechat.prototype.deleteTags = function(tagId) {
    var that = this;
    return new Promise(function(resolve, reject) {
        that.fetchAccessToken()
        .then(function(data) {
            var options = { tag : { id : tagId,} }
            var url = api.tags.del + 'access_token=' + data.access_token;
            request({ method: 'POST', url:url, body: options,json:true})
                .then(function(response){
                    var _data = response.body;
                    if(_data) {
                        resolve(_data);
                    } else{
                        throw new Error('delete tag fails');
                    }
            })
            .catch(function(err){
                reject(err);
            });
        });
    });
}

/** 获取摸个标签下的所有用户信息 **/
Wechat.prototype.fetchTagUsers = function(tagId, next_openid) {
    var that = this;
    next_openid = next_openid || '';
    return new Promise(function(resolve, reject) {
        that.fetchAccessToken()
        .then(function(data) {
            var options = { tag : { id : tagId,} }
            var url = api.tags.fetchTagUsers + 'access_token=' + data.access_token;
            request({method : 'POST', url:url, body: options, json:true})
                .then(function(response){
                    var _data = response.body;
                    if(_data) {
                        resolve(_data);
                    } else{
                        throw new Error('fetchTagUsers tags fails');
                    }
            })
            .catch(function(err){
                reject(err);
            });
        });
    });
}

/** batchuntag **/
Wechat.prototype.Batchtag = function(tagId, openIds) {
    var that = this;
    return new Promise(function(resolve, reject) {
        that.fetchAccessToken()
        .then(function(data) {
            var options = { tagid: tagId, openIds}
            var url = api.tags.batchuntag + 'access_token=' + data.access_token;
            request({method : 'POST', url:url, body: options, json:true})
                .then(function(response){
                    var _data = response.body;
                    if(_data) {
                        resolve(_data);
                    } else{
                        throw new Error('Batchtag fails');
                    }
            })
            .catch(function(err){
                reject(err);
            });
        });
    });
}

Wechat.prototype.Batchuntag = function(tagId, openIds) {
    var that = this;
    return new Promise(function(resolve, reject) {
        that.fetchAccessToken()
        .then(function(data) {
            var options = { tagid: tagId, openIds}
            var url = api.tags.batchuntag + 'access_token=' + data.access_token;
            request({method : 'POST', url:url, body: options, json:true})
                .then(function(response){
                    var _data = response.body;
                    if(_data) {
                        resolve(_data);
                    } else{
                        throw new Error('Batchuntag fails');
                    }
            })
            .catch(function(err){
                reject(err);
            });
        });
    });
}

Wechat.prototype.fetchUserTag = function(openId) {
    var that = this;
    return new Promise(function(resolve, reject) {
        that.fetchAccessToken()
        .then(function(data) {
            var options = { openid : openId}
            var url = api.tags.getidlist + 'access_token=' + data.access_token;
            request({method : 'POST', url:url, body: options, json:true})
                .then(function(response){
                    var _data = response.body;
                    if(_data) {
                        resolve(_data);
                    } else{
                        throw new Error('Batchuntag fails');
                    }
            })
            .catch(function(err){
                reject(err);
            });
        });
    });
}

module.exports = Wechat;
