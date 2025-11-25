
export const initialstate = {
    page:"",
    entityname:"",
    entityid:"",
    tonumbers:[],
    phonenumber:[],
    validentityid:[],
    loader:false,
    twilionumber:"",
    twilioSID:"",
    twilioauthtoken:"",
    smstemplate:null,
    templatemessage:"",
    templatemessageid:"",
    sid:false,
    smsactivityid:[],
    show:false,

    clicksenduserid:"",
    clicksendusername:"",
    clicksendapikey:""
}

const reducer = (state,action) => {

    if(action.type === "SETPAGE"){
      return{
        ...state,
        page: action.payload
      }
    }else if(action.type === "SETENTITYNAME"){
      return{
        ...state,
        entityname:action.payload
      }
    }else if(action.type === "SETENTITYID"){
      return{
        ...state,
        entityid:action.payload
      }
    }else if(action.type === "SETTONUMBES"){
      
      return{
        ...state,
        tonumbers:[...state.tonumbers, {"FirstName":action.payload.First_Name, "LastName":action.payload.Last_Name}]
      }
    }else if(action.type === "SETPHONENUMBER"){
      return{
        ...state,
        phonenumber:action.payload
      }
    }else if(action.type === "SETVALIDENTITYID"){
      return{
        ...state,
        validentityid:[...state.validentityid,action.payload.id]
      }
    }else if(action.type === "SETLOADER"){
      return{
        ...state,
        loader: action.payload
      }
    }else if(action.type === "SETTWILIONUMBER"){
      return{
        ...state,
        twilionumber: action.payload
      }
    }else if(action.type === "SETTWILIOSID"){
      return{
        ...state,
        twilioSID: action.payload
      }
    }else if(action.type === "SETTWILIOAUTHTOKEN"){
      return{
        ...state,
        twilioauthtoken: action.payload
      }
    }else if(action.type === "SETSMSTEMPLATE"){
      return{
        ...state,
        smstemplate: action.payload
      }
    }else if(action.type === "SETTEMPLATEMESSAGE"){
      return{
        ...state,
        templatemessage:action.payload
      }
    }else if(action.type === "SETTEMPLATEMESSAGEID"){
      return{
        ...state,
        templatemessageid:action.payload
      }
    }else if(action.type === "SETSID"){
      return{
        ...state,
        sid: action.payload
      }
    }else if(action.type === "SETSHOW"){
      return{
        ...state,
        show: action.payload
      }
    }


    else if(action.type === "CLICKSENDUSERID"){
      return{
        ...state,
        clicksenduserid: action.payload
      }
    }else if(action.type === "CLICKSENDUSERNAME"){
      return{
        ...state,
        clicksendusername: action.payload
      }
    }else if(action.type === "CLICKSENDSENDERID"){
      return{
        ...state,
        clicksendsenderid: action.payload
      }
    }else if(action.type === "CLICKSENDAPIKEY"){
      return{
        ...state,
        clicksendapikey: action.payload
      }
    }
}

export default reducer;