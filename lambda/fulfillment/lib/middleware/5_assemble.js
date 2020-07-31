var Promise=require('bluebird')
var lex=require('./lex')
var alexa=require('./alexa')
var _=require('lodash')
var util=require('./util')

function sms_hint(req,res) {
    var hint = "";
    if (_.get(req,"_event.requestAttributes.x-amz-lex:channel-type") == "Twilio-SMS") {
        if (_.get(req,"_settings.SMS_HINT_REMINDER_ENABLE") == 'true') {
            var interval_hrs = parseInt(_.get(req,'_settings.SMS_HINT_REMINDER_INTERVAL_HRS','24'));
            var hint_message = _.get(req,'_settings.SMS_HINT_REMINDER',"");
            var hours = req._userInfo.TimeSinceLastInteraction / 36e5;
            if (hours >= interval_hrs) {
                hint = hint_message;
                console.log("Appending hint to SMS answer: ", hint);
            }
        }
    }
    return hint;
}

function resetAttributes(req,res) {
    // Kendra attributes
    let previous;
    let prevQid;
    let kendraResponsibleQid;
    previous = _.get(req._event.sessionAttributes,"previous");
    if (previous) {
        let obj = JSON.parse(previous);
        prevQid = obj.qid;
    }
    kendraResponsibleQid = _.get(res.session,"qnabotcontext.kendra.kendraResponsibleQid");
    if ( (res.result === undefined || res.result.qid === undefined) || ( kendraResponsibleQid && (res.result.qid !== kendraResponsibleQid))) {
        // remove any prior session attributes for kendra as they are no longer valid
        _.unset(res,"session.qnabotcontext.kendra.kendraQueryId") ;
        _.unset(res,"session.qnabotcontext.kendra.kendraIndexId") ;
        _.unset(res,"session.qnabotcontext.kendra.kendraResultId") ;
        _.unset(res,"session.qnabotcontext.kendra.kendraResponsibleQid") ;
    }
}

module.exports=async function assemble(req,res){
    if(process.env.LAMBDA_LOG){
        await util.invokeLambda({
            FunctionName:process.env.LAMBDA_LOG,
            InvocationType:"Event",
            req,res
        })
    }

    if(process.env.LAMBDA_RESPONSE){
        var result=await util.invokeLambda({
            FunctionName:process.env.LAMBDA_RESPONSE,
            InvocationType:"RequestResponse",
            Payload:JSON.stringify(res)
        })

        _.merge(res,result)
    }
    
    // append hint to SMS message (if it's been a while since user last interacted)
    res.message += sms_hint(req,res)
    
    res.session=_.mapValues(
        _.get(res,'session',{}),
        x=>_.isString(x) ? x : JSON.stringify(x)
    )

    resetAttributes(req,res);

    switch(req._type){
        case 'LEX':
            res.out=lex.assemble(req,res)
            break;
        case 'ALEXA':
            res.out=alexa.assemble(req,res)
            break;
    }

    return {req,res}
}
