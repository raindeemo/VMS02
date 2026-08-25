(function(VMS,$){
    'use strict';
    function filter(field,operator,value){return{field:field,operator:operator||'eq',value:value};}
    function categories(actor,field){var ids=VMS.SharePointSchema.lookupIds(actor&&actor.AssignedCategories||[]),operator=field==='Categories'?'containsValue':'eq';return ids.length?{any:$.map(ids,function(id){return filter(field,operator,id);})}:{deny:true};}
    function broad(){return{all:[]};}
    function build(dataset,actor,operation){var role=actor&&actor.RoleCode,fn=actor&&actor.FunctionCode,worker=$.inArray(role,['EMPLOYEE','CO_OP'])>=0,scope;
        if(!actor||!actor.IsActive){return{deny:true};}
        if(role==='ADMIN'||role==='SUPER_ADMIN'||role==='UPPER_MANAGEMENT'){return broad();}
        if(dataset==='userDB'){return role==='MANAGER'?{all:[filter('FunctionCode','eq',fn),filter('RoleCode','in',['EMPLOYEE','CO_OP'])]}:{deny:true};}
        if(dataset==='ML_vendor'){if(operation==='report'&&fn==='EXCELLENCE'&&worker){return broad();}return fn==='VENDOR_MANAGEMENT'&&role==='MANAGER'?broad():worker&&fn==='VENDOR_MANAGEMENT'?categories(actor,'Categories'):{deny:true};}
        if(dataset==='Invoice'){if(operation==='report'&&fn==='EXCELLENCE'&&worker){return broad();}if(fn==='VENDOR_MANAGEMENT'&&role==='MANAGER'){return broad();}scope=categories(actor,'Category');if(worker&&fn==='VENDOR_MANAGEMENT'&&actor.IsDirectPaymentAuthorized){scope.any.push(filter('DirectPayment','eq',true));}if(worker){scope.any.push(filter('FocalPointEmail','eq',actor.UserKey));}return scope;}
        if(dataset==='Feedback_Assignment'){if(role==='MANAGER'&&operation==='metadata'){return{all:[filter('FunctionCode','eq',fn)],selectDeny:['AnswerPayload','QuestionSetSnapshotJSON','TotalScore','OverallScore']};}return worker||role==='MANAGER'?{any:[filter('AssignedUser','eq',actor.ID),filter('AssignedUserEmail','eq',actor.UserKey)]}:{deny:true};}
        if(dataset==='Workflow_History'){return role==='MANAGER'?{any:[filter('PerformedBy','eq',actor.ID),filter('PerformedByUserKeySnapshot','eq',actor.UserKey)]}:{deny:true};}
        if(dataset==='PR_PO'||dataset==='PO_Lines'){if(fn==='VENDOR_MANAGEMENT'&&role==='MANAGER'||fn==='EXCELLENCE'&&worker){return broad();}return{requiresAuthorizedParentIds:true,deny:true};}
        return broad();
    }
    function validate(scope){return !!scope&&typeof scope==='object'&&!Object.prototype.hasOwnProperty.call(scope,'raw');}
    function collect(repository,spec){var d=$.Deferred(),ids=[];function next(token){spec.continuationToken=token||null;repository.query(spec).then(function(result){if(!result||result.ok===false){d.resolve([]);return;}$.each(result.items||[],function(_,row){ids.push(Number(row.ID));});if(result.continuationToken){next(result.continuationToken);}else{d.resolve(ids);}});}next(null);return d.promise();}
    function resolve(dataset,actor,operation,context){var initial=build(dataset,actor,operation),vendorScope,headerScope;if(!initial.requiresAuthorizedParentIds){return VMS.Utilities.resolved(initial);}if(dataset==='PR_PO'){vendorScope=build('ML_vendor',actor,operation);return collect(VMS.Repositories.VendorRepository,{authorizationScope:vendorScope,select:['ID'],pageSize:100}).then(function(ids){return ids.length?{all:[filter('Vendor','in',ids)]}:{deny:true};});}if(dataset==='PO_Lines'&&context&&context.parentId){return VMS.Utilities.resolved({all:[filter('POHeader','eq',Number(context.parentId))]});}headerScope=build('PR_PO',actor,operation);if(headerScope.requiresAuthorizedParentIds){return resolve('PR_PO',actor,operation).then(function(scope){return collect(VMS.Repositories.PRPORepository,{authorizationScope:scope,select:['ID'],pageSize:100}).then(function(ids){return ids.length?{all:[filter('POHeader','in',ids)]}:{deny:true};});});}return collect(VMS.Repositories.PRPORepository,{authorizationScope:headerScope,select:['ID'],pageSize:100}).then(function(ids){return ids.length?{all:[filter('POHeader','in',ids)]}:{deny:true};});}
    VMS.AuthorizationScope={build:build,resolve:resolve,validate:validate,filter:filter};
}(window.VMS,window.jQuery));
