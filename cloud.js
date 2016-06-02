/**
 * @Author   bibitiger
 * @DateTime 2016-05-30T15:13:19+0800
 * @description define cloud functions for 呼吸康test by avoscloud
 */

var AV = require('leanengine');
var uuid = require('node-uuid');

/**
 * 一个简单的云代码方法
 */
AV.Cloud.define('hello', function(request, response) {
	console.log("func hello "+JSON.stringify(request.params));
	if(request.user){
		console.log("session token " + request.sessionToken);
		console.log("user is "+request.user.getUsername());
	}else{
		console.log("user is nil");
	}

  	response.success('Hello world!');
});

/**
 * @Author   bibitiger
 * @DateTime 2016-05-30T15:13:19+0800
 * @description for client to request a doctor due with report, if by now no useful doc will return response with "no useful doctor"
 */
AV.Cloud.define('RquestDoctor', function(request, response) {

	//check out current patient
	var patients = new AV.Query('Patients');
	patients.equalTo('user', request.user);
	patients.find({
		success: function(listPatient){
			if(listPatient.length != 1){
				console.log("cant find patient");
				for (var i = 0; i < listPatient.length; ++i) {
					console.log(JSON.stringify(listPatient[i]));
				}
				response.error("cant find patient");
				return;
			} else {
				console.log("current patient is " + JSON.stringify(listPatient[0]));

				//check out target report with current patient
				var reports = new AV.Query('Reports');
				reports.equalTo('idPatient', listPatient[0]);
				reports.equalTo('objectId', request.params.report);
				reports.include('Doctor');
				reports.find({
					success: function(listReport){
						if(listReport.length != 1){
							console.log("reports cnt is " + JSON.stringify(listReport.length));
							response.error("cant find report");
							for (var i = 0; i < listReport.length; ++i) {
								console.log(JSON.stringify(listReport[i]));
							}
						} else {
							console.log("current report is " + JSON.stringify(listReport[0]));

							//check out target doctor
							var docs = new AV.Query('DoctorPub');
							docs.include('CreateBy');
							docs.find({
								success: function(listDoc){
									var loc = Math.round(Math.random()*listDoc.length);
									console.log("chose doc is " + JSON.stringify(listDoc[loc]));

									if(listReport[0].get('Doctor')){
										response.error("this report has been assigned to a doctor");
										return;
									}

									//get user who create doctorPub
									console.log("chose user is " + JSON.stringify(listDoc[loc].get('CreateBy')));
									//set doctor to report and set report InCheck to 'true'
									listReport[0].fetchWhenSave(true);
									listReport[0].set('Doctor', listDoc[loc]);
									listReport[0].set('CheckState', "WaitDoc");
									listReport[0].set('CheckId', uuid.v1());

									//set acl to doc and patient
									var groupACL = new AV.ACL();
									groupACL.setReadAccess(listDoc[loc].get('CreateBy'), true);
									groupACL.setWriteAccess(listDoc[loc].get('CreateBy'), false);
									groupACL.setReadAccess(request.user, true);
									groupACL.setWriteAccess(request.user, true);
									listReport[0].setACL(groupACL);


									console.log("test");
									//save report to server
									listReport[0].save().then(function(report){
										console.log("now report is " + JSON.stringify(report));
										console.log("doc user id is " + listDoc[loc].get('CreateBy').get('objectId'));

										//push msg to doc
										AV.Push.send({
											channels: [listDoc[loc].get('CreateBy').get('objectId')],
											data: {
												alert: 'new report'
											}
										});

										//success
										response.success(listDoc[loc]);
									}, function(e){
										response.error(e);
									});
									
								}, 
								error: function(e){
									response.error(e);
								}
							})
						}
					},
					error: function(e){
						response.error(e);
					}
				});
			}
		}, 
		error: function(e){
			console.log(JSON.stringify(e));
			response.error(e);
		}
	});
});

/**
 * @Author   bibitiger
 * @DateTime 2016-06-01T15:07:50+0800
 * @description for client to Login with Weixin
 */
AV.Cloud.define('WXLogin', function(request, response) {
	var openId = request.params.openId;
	var access_token = request.params.access_token;
	var expires_in = request.params.expires_in;

	// console.log('test:' + openId + access_token + expires_in);

	// var authData = {'openid': openId,'access_token': access_token,'expires_in': expires_in};
	var data = {};


	AV.User._logInWith('WeiXin', {
	  'authData': {
		    'uid': openId,
		    'access_token': access_token,
		    'expires_in': expires_in
		  }
	}).then(function(user) {
	  //返回绑定后的用户
	    console.log('user:' + user);
	    var query = new AV.Query('Patients');
	    query.equalTo('user', user);
	    query.find().then(function(results) {
	        
	        if(results.length < 1){
	                console.log('lenght0');
	                var Patient = AV.Object.extend('Patients');
	    
	                var patient = new Patient();
	                // patient.set('objectId',user.id);
	                patient.set('user',user)
	                
	                // 新建一个 ACL 实例
	                var acl = new AV.ACL();
	                acl.setPublicReadAccess(true);
	                acl.setWriteAccess(user,true);
	                  // 将 ACL 实例赋予 patient 对象
	                patient.setACL(acl);
	                
	                patient.save().then(function(patient) {
	                    // 成功保存之后，执行其他逻辑.
	                    
	                    data['profileId'] = patient.id;
	                    data['user'] = user;
	                    data['sessionToken'] = user._sessionToken;
	                    data['userId'] = user.id;
	                    
	                    response.success(data);
	                }, function(err) {
	                    // 失败之后执行其他逻辑
	                    // error 是 AV.Error 的实例，包含有错误码和描述信息.
	                    console.log('Failed to create new object, with error message: ' + err.message);
	                    response.error(err);
	                });
	        }else{
	            console.log('lenght1');
	            var profile = results[0];
	            
	            data['userId'] = user.id;
	            data['profileId'] = profile.id;
	            data['sessionToken'] = user._sessionToken;
	            data['user'] = user;
	            //...
	            response.success(data);   
	        }
	    }, function(error) {
	        console.log('Error: ' + error.code + ' ' + error.message);
	        response.error(error);
	        
	    });

	}, function(error) {
	  console.log(error);
	  response.error(error);
	});
});

/**
 * @Author   bibitiger
 * @DateTime 2016-06-01T15:07:50+0800
 * @description for client to Login with phone
 */
AV.Cloud.define('login', function(request, response) {
	var phoneNumber = request.params.phoneNumber;
	var password = request.params.password;

	// console.log(phoneNumber + '---' + password);

	var data = {};

	AV.User.logInWithMobilePhone(phoneNumber, password).then(function(user) {
	  //登录成功
	    var query = new AV.Query('Patients');
	    query.equalTo('user', user);
	    query.find().then(function(results) {
	        
	        if(results.length > 0){
	                var profile = results[0];
	                
	                data['userId'] = user.id;
	                data['profileId'] = profile.id;
	                data['sessionToken'] = user._sessionToken;
	                data['user'] = user;
	                //...
	                response.success(data);            
	        }else{
	                var Patient = AV.Object.extend('Patients');
	                var patient = new Patient();
	                patient.set('user',user)
	                
	                 // 新建一个 ACL 实例
	                var acl = new AV.ACL();
	                acl.setPublicReadAccess(true);
	                acl.setWriteAccess(user,true);
	                  // 将 ACL 实例赋予 patient 对象
	                patient.setACL(acl);
	            
	                patient.save().then(function(patient) {
	                    
	                    data['userId'] = user.id;
	                    data['profileId'] = patient.id;
	                    data['sessionToken'] = user._sessionToken;
	                    data['user'] = user;
	                    //...
	                    response.success(data); 
	                }, function(err) {
	                    
	                    console.log('Failed to create new object, with error message: ' + err.message);
	                    response.error(err);
	                });
	        }

	    }, function(error) {
	        console.log('Error: ' + error.code + ' ' + error.message);
	    });
	  
	}, function(err) {
	  //登录失败
	  response.error(err);
	});
});

/**
 * @Author   bibitiger
 * @DateTime 2016-06-01T15:07:50+0800
 * @description 
 */
AV.Cloud.define('phoneCheckCode', function(request, response) {

	var phoneNumber = request.params.phoneNumber;

	var query = new AV.Query(AV.User);
	query.equalTo('mobilePhoneNumber', phoneNumber); 
	query.find().then(function(results) {
	  if(results.length > 0){
	      response.error('该手机号已被注册');
	  }else{
	     
	    AV.Cloud.requestSmsCode(phoneNumber).then(function() {
	      //发送成功
	      response.success(phoneNumber);
	    }, function(err) {
	      //发送失败
	        response.error(err);
	    });
	 
	  }
	}, function(err) {
	  //发送失败
	    response.error(err);
	});
});

/**
 * @Author   bibitiger
 * @DateTime 2016-06-01T15:07:50+0800
 * @description 
 */
AV.Cloud.define('register', function(request, response) {
	//登录或者注册使用同一个接口

	var phoneNumber = request.params.phoneNumber;
	var password = request.params.password;
	var checkCode = request.params.checkCode;


	var data = {};

	var user = new AV.User();
	user.signUpOrlogInWithMobilePhone({
	  mobilePhoneNumber: request.params.phoneNumber,
	  smsCode: request.params.checkCode,
	  password: request.params.password,
	}).then(function(user) {
	    var Patient = AV.Object.extend('Patients');
	    var patient = new Patient();
	    patient.set('user',user)
	    
	     // 新建一个 ACL 实例
	    var acl = new AV.ACL();
	    acl.setPublicReadAccess(true);
	    acl.setWriteAccess(user,true);
	      // 将 ACL 实例赋予 patient 对象
	    patient.setACL(acl);

	    patient.save().then(function(patient) {
	        
	        response.success(user);
	    }, function(err) {
	        
	        console.log('Failed to create new object, with error message: ' + err.message);
	        response.error(err);
	    });
	    
	}, function(error) {
	  // 失败
	  console.log(error);
	  response.error(error);
	});
});

/**
 * @Author   bibitiger
 * @DateTime 2016-06-01T15:07:50+0800
 * @description 
 */
AV.Cloud.define('boundWX', function(request, response) {

	var sessionToken = request.params.token;
	var openId = request.params.openId;
	var access_token = request.params.access_token;
	var expires_in = request.params.expires_in;

	var query = new AV.Query(AV.User);
	query.equalTo('WXOpenId', openId); 
	query.find().then(function(results) {
	  if(results.length > 0){
	      response.error('该微信已被其他账号绑定');
	  }else{
	        AV.User.become(sessionToken).then(function (user) {
	          // The current user is changed.
	            user._linkWith('WeiXin', {
	                'authData': {
	                'uid': openId,
	                'access_token': access_token,
	                'expires_in': expires_in
	                }
	            }).then(function(user) {
	              //返回绑定后的用户
	              console.log(user);
	              
	              user.set('WXOpenId', openId);
	              user.save().then(function (user){
	                response.success(user);
	              }, function (error){
	                response.error(error);
	              });
	            }, function(error) {
	              console.log(error);
	              response.error(error);
	            });
	        }, function (error) {
	          // Login failed.
	            response.error(error);
	        });     
	  }
	}, function(err) {
	  //发送失败
	    response.error(err);
	});




});

/**
 * @Author   bibitiger
 * @DateTime 2016-06-01T15:07:50+0800
 * @description 
 */
AV.Cloud.define('boundPhone', function(request, response) {
	var sessionToken = request.params.token;
	var phoneNumber = request.params.phoneNumber;

	var query = new AV.Query(AV.User);
	query.equalTo('mobilePhoneNumber', phoneNumber); 
	query.find().then(function(results) {
	  if(results.length > 0){
	      response.error('该手机号已绑定其他账号');
	  }else{
	        AV.User.become(sessionToken).then(function (user) {
	          // The current user is changed.
	          
	            user.set('mobilePhoneNumber',phoneNumber);
	            user.save().then(function() {
	              // 成功
	              user.set('mobilePhoneVerified',true);
	              user.save().then(function() {
	                response.success(user);
	              }, function (error){
	                response.error(error);
	            });
	        
	            }, function (error){
	                response.error(error);
	            });
	        }, function (error) {
	          // Login failed.
	            response.error(error);
	        });
	  }
	}, function(err) {
	  //发送失败
	    response.error(err);
	});

});

/**
 * @Author   bibitiger
 * @DateTime 2016-06-01T15:07:50+0800
 * @description 
 */
AV.Cloud.define('refuseReportByDoc', function(request, response) {
	//findReport with report id & doc
	findReportByReportAndDoc(request.params.report, request.user, {
		success: function(report){
			console.log("refuseReportByDoc refuse report is " + JSON.stringify(report));

			if(report.get('CheckState') != "WaitDoc"){
				response.error("report state error");
			}

			var doc = report.get('Doctor');
			var checkId = report.get('CheckId');

			report.fetchWhenSave(true);
			report.unset('Doctor');
			report.unset('CheckState');
			report.unset('CheckId');

			var groupACL = new AV.ACL();
			console.log("patient user is " + JSON.stringify(report.get('idPatient').get('user')));
			groupACL.setReadAccess(report.get('idPatient').get('user'), true);
			groupACL.setWriteAccess(report.get('idPatient').get('user'), true);
			groupACL.setReadAccess(request.user, false);
			groupACL.setWriteAccess(request.user, false);
			report.setACL(groupACL);

			report.save().then(function(report){
				var history = AV.Object.new('ReportCheckHistory');
				console.log(JSON.stringify(history));
				history.set('Report', report);
				history.set('Note', "refuse by doctor " + doc.get('objectId'));
				history.set('CheckId', checkId);
				history.set('Doctor', doc);
				history.set('state', "RefuseByDoc");
				console.log(JSON.stringify(history));
				history.save().then(function(history){
					AV.Push.send({
						channels: [report.get('idPatient').get('user').get('objectId')],
						data: {
							alert: "report " + report.get('objectId') + " refuse by doctor"
						}
					});
					console.log(JSON.stringify(history));
					response.success(history);
				}, function(e){
					console.log(JSON.stringify(e));
					response.error(e);
				});
			}, function(e){
				console.log(JSON.stringify(e));
				response.error(e);
			});
		},
		error: function(e){
			console.log(JSON.stringify(e));
			response.error(e);
		}
	})
});

/**
 * @Author   bibitiger
 * @DateTime 2016-06-01T15:07:50+0800
 * @description 
 */
AV.Cloud.define('confirmReportByDoc', function(request, response) {
	//findReport with report id & doc
	findReportByReportAndDoc(request.params.report, request.user, {
		success: function(report){
			console.log("confirmReportByDoc confirm report is " + JSON.stringify(report));
			console.log("user is " + report.get('idPatient').get('user').get('objectId'));

			if(report.get('CheckState') != "WaitDoc"){
				response.error("report state error");
			}

			var doc = report.get('Doctor');
			var checkId = report.get('CheckId');

			report.fetchWhenSave(true);
			report.set('CheckState', "InCheck");

			var groupACL = new AV.ACL();
			console.log("patient user is " + JSON.stringify(report.get('idPatient').get('user')));
			groupACL.setReadAccess(report.get('idPatient').get('user'), true);
			groupACL.setWriteAccess(report.get('idPatient').get('user'), true);
			groupACL.setReadAccess(request.user, true);
			groupACL.setWriteAccess(request.user, true);
			report.setACL(groupACL);

			report.save().then(function(report){
				var history = AV.Object.new('ReportCheckHistory');
				history.set('Report', report);
				history.set('Note', "comfirm by doctor " + doc.get('objectId'));
				history.set('CheckId', checkId);
				history.set('Doctor', doc);
				history.set('state', "BeginCheck");
				history.set('Conversation', request.params.conversation);
				history.save().then(function(history){
					console.log("history success");
					AV.Push.send({
						channels: [report.get('idPatient').get('user').get('objectId')],
						data: {
							alert: "report " + report.get('objectId') + " begin check"
						}
					});
					console.log(JSON.stringify(history));
					response.success(history);
				}, function(e){
					console.log(JSON.stringify(e));
					response.error(e);
				});
			}, function(e){
				console.log(JSON.stringify(e));
				response.error(e);
			});
		},
		error: function(e){
			console.log(JSON.stringify(e));
			response.error(e);
		}
	})
});

/**
 * @Author   bibitiger
 * @DateTime 2016-06-02T18:23:03+0800
 * @description 
 */
AV.Cloud.define('RefuseReportByUser', function(request, response) {
}

/**
 * @Author   bibitiger
 * @DateTime 2016-06-02T18:23:03+0800
 * @description 
 */
AV.Cloud.define('CloseCheckByDoc', function(request, response) {
}

/**
 * @Author   bibitiger
 * @DateTime 2016-06-02T18:23:03+0800
 * @description 
 */
AV.Cloud.define('CloseCheckByDoc', function(request, response) {
}

/**
 * @Author   bibitiger
 * @DateTime 2016-06-02T18:23:03+0800
 * @description 
 */
AV.Cloud.define('commentByUser', function(request, response) {
}

/**
 * @Author   bibitiger
 * @DateTime 2016-06-02T18:23:03+0800
 * @description 
 */
AV.Cloud.define('commentByDoctor', function(request, response) {
}

/**
 *
 * @DateTime 2016-06-01T23:51:50+0800
 *
 * @author bibitiger
 *
 * maintain the elegant code comments
 * @param {string} reportId reportId
 * @param {AV.object} doc _User
 * @param {[type]} options [description]
 * @return {[type]}
 */
function findReportByReportAndDoc(reportId, doc, options){
	var doctors = new AV.Query('DoctorPub');
	doctors.equalTo('CreateBy', doc);
	doctors.find({
		success: function(listDoc){
			if(listDoc.length != 1){
				if(options.error){
					for (var i = 0; i < listDoc.length; ++i) {
						console.log(JSON.stringify(listDoc[i]));
					}
					options.error.call(this, new AV.Error(AV.Error.INTERNAL_SERVER_ERROR, "cant find doc"));
				}
			} else {
				var reports = new AV.Query('Reports');
				reports.equalTo('Doctor', listDoc[0]);
				reports.equalTo('objectId', reportId);
				reports.include(['idPatient.user']);
				reports.include('Doctor');
				reports.find({
					success: function(listReport){
						if(listReport.length != 1){
							if(option.error){
								options.error.call(this, new AV.Error(AV.Error.INTERNAL_SERVER_ERROR, "cant find report"));
							}
						} else {
							if(options.success){
								options.success.call(this, listReport[0]);
							}
						}
					},
					error: function(e){
						console.log(JSON.stringify(e));
						if(options.error){
							options.error.call(this, e);
						}
					}
				})
			}
		},
		error: function(e){
			if(options.error){
				options.error.call(this, e);
			}
		}
	});
}


module.exports = AV.Cloud;
