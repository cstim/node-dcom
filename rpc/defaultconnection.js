var NdrBuffer = require('../ndr/ndrbuffer.js');
var NetworkDataRepresentation = require('../ndr/networkdatarepresentation.js');
var AuthenticationVerifier = require('./core/authenticationverifier.js');
var AlterContextPdu = require('./pdu/altercontextpdu.js');
var AlterContextResponsePdu = require("./pdu/altercontextresponsepdu.js");
var Auth3Pdu = require('./pdu/auth3pdu.js');
var BindAcknowledgePdu = require('./pdu/bindacknowledgepdu.js');
var BindNoAcknowledgePdu = require('./pdu/bindnoacknowledgepdu.js');
var BindPdu = require('./pdu/bindPdu.js');
var CancelCoPdu = require('./pdu/cancelCoPdu.js');
var ConnectionOrientedPdu = require('./connectionorientedpdu.js');
var FaultCoPdu = require('./pdu/faultCoPdu.js');
var OrphanedPdu = require('./pdu/orphanedpdu.js');
var RequestCoPdu = require('./pdu/requestcopdu.js');
var ResponseCoPdu = require('./pdu/responsecopdu.js');
var ShutdownPdu = require('./pdu/shutdownpdu.js');

class DefaultConnection
{
  constructor(transmitLength, receiveLength)
  {
    if (transmitLength == undefined && receiveLength == undefined){
      transmitLength = ConnectionOrientedPdu.MUST_RECEIVE_FRAGMENT_SIZE;
      receiveLength = ConnectionOrientedPdu.MUST_RECEIVE_FRAGMENT_SIZE;
    }

    this.ndr = new NetworkDataRepresentation();
    this.transmitBuffer = new NdrBuffer([transmitLength], 0);
    this.receiveBuffer = new NdrBuffer([receiveLength], 0);
    this.security;
    this.contextId;
    this.bytesRemainingInReceiveBuffer = false;
  }

  transmit(pdu, transport)
  {
    if (!(pdu instanceof Fragmentable)){
      this.transmitFragment(pdu, transport);
      return;
    }

    var fragments = pdu.fragment(this.transmitBuffer.getCapacity());
    while(fragments.hasNext()){
      this.transmitFragment(fragments.next(), transport);
    }
  }

  receive(transport)
  {
    var fragment = this.receiveFragment(transport);
    if (!(fragment instanceof Fragmentable) || fragment.getFlag(ConnectionOrientedPdu.PFC_LAST_FRAG)){
      return fragment;
    }

    return fragment.assemble((array) =>{
      var currentFragmetn = fragment;
      var i = 0;

      return{
        hasNext: () =>{
          return (currentFragmetn != null);
        },
        next: () =>{
          if (currentFragmetn == null)
            throw new Error("No such element.");

          try{
            return currentFragmetn;
          }finally{
            if (currentFragmetn.getFlag(ConnectionOrientedPdu.PFC_LAST_FRAG)){
              currentFragmetn = null;
            }else{
              currentFragmetn = this.receiveFragment(transport);
            }
          }
        }
      }
    });
  }

  transmitFragment(fragment, transport)
  {
    this.transmitBuffer.reset();
    fragment.encode(ndr, this.transmitBuffer);
    this.processOutgoing();
    transport.send(transmitBuffer);
  }

  receiveFragment(transport)
  {
    var fragmentLength = -1;
    var type = -1;
    var read = true;

    if (bytesRemainingInReceiveBuffer) {
      if (this.receiveBuffer.length > ConnectionOrientedPdu.TYPE_OFFSET){
        this.receiveBuffer.setIndex(ConnectionOrientedPdu.TYPE_OFFSET);
        type = this.receiveBuffer.dec_ndr_small();

        if (isValidType(type)){
          while (this.receiveBuffer.length <= ConnectionOrientedPdu.FRAG_LENGTH_OFFSET){
            var tmpBuffer = new NdrBuffer([10], 0);
            transport.receive(tmpBuffer);

            var aux = tmpBuffer.buf.slice(0, tmpBuffer.length);
            var aux_i = 0;
            while (aux.length > 0)
              this.receiveBuffer.buf.splice(aux_i++, 0, aux.shift());
            this.receiveBuffer.length = this.receiveBuffer.length + tmpBuffer.length;
          }
          read = false;
        }
      }
      this.bytesRemainingInReceiveBuffer = false;
    }

    if (read){
      this.receiveBuffer.reset();

      transport.receive(this.receiveBuffer);
    }

    var newBuffer = null;
    var counter = 0;
    var trimSize = -1;
    var lengthOfArrayTobeRead = this.receiveBuffer.length;

    if (this.receiveBuffer.length > 0){
      this.receiveBuffer.setIndex(connectionorientedpdu.FRAG_LENGTH_OFFSET);
      fragmentLength = this.receiveBuffer.dec_ndr_short();

      newbuffer = [fragmentLength];

      if (fragmentLength > this.receiveBuffer.length){
        var remainingBytes = fragmentLength - this.receiveBuffer.length;

        while (fragmentLength > counter){
          var aux = this.receiveBuffer.buf.slice(0, lengthOfArrayTobeRead);
          var aux_i = counter;
          while(aux.length > 0)
            newBuffer.splice(aux_i++, 0, aux.shift());

          counter = counter + lengthOfArrayTobeRead;
          if (fragmentLength == counter){
            break;
          }

          this.receiveBuffer.reset();
          transport.receive(this.receiveBuffer);
          if (fragmentLength - counter >= this.receiveBuffer.length){
            lengthOfArrayTobeRead = this.receiveBuffer.length;
          }else{
            lengthOfArrayTobeRead = fragmentLength - counter;
            trimSize = this.receiveBuffer.length - lengthOfArrayTobeRead;
          }


        }
      } else {
        var aux = this.receiveBuffer.buf.slice(0, fragmentLength);
        var aux_i = 0;
        while(aux.length > 0)
          newBuffer.splice(aux_i++, 0, aux.shift());
        trimSize = this.receiveBuffer.length - fragmentLength;
      }

      if (trimSize > 0){
        aux = this.receiveBuffer.buf.slice(this.receiveBuffer.length - trimsize, trimSize);
        aux_i = 0;
        while (aux.length > 0)
          this.receiveBuffer.buf.splice(aux_i++, 0, aux.shift());
        this.receiveBuffer.length = trimSize;
        this.receiveBuffer.index = 0;
        this.receiveBuffer.start = 0;
        bytesRemainingInReceiveBuffer = truke;
      }

      var bufferTobeUsed = new NdrBuffer(newBuffer, 0);
      bufferTobeUsed.length = newBuffer.length;

      this.processIncoming(bufferTobeUsed);
      bufferTobeUsed.setIndex(ConnectionOrientedPdu.TYPE_OFFSET);
      type = bufferTobeUsed.dec_ndr_small();

      var pdu = null;
      switch (type) {
        case AlterContextPdu.ALTER_CONTEXT_TYPE:
          pdu = new AlterContextPdu();
          break;
        case AlterContextResponsePdu.ALTER_CONTEXT_RESPONSE_TYPE:
          pdu = new AlterContextResponsePdu();
          break;
        case Auth3Pdu.AUTH3_TYPE:
          pdu = new Auth3Pdu();
          break;
        case BindPdu.BIND_TYPE:
          pdu = new BindPdu();
          break;
        case BindAcknowledgePdu.BIND_ACKNOWLEDGE_TYPE:
          pdu = new BindAcknowledgePdu();
          break;
        case BindNoAcknowledgePdu.BIND_NO_ACKNOWLEDGE_TYPE:
          pdu = new BindNoAcknowledgePdu();
          break;
        case CancelCoPdu.CANCEL_TYPE:
          pdu = new CancelCoPdu();
          breakl
        case FaultCoPdu.FAULT_TYPE:
          pdu = new FaultCoPdu();
          break;
        case OrphanedPdu.ORPHANED_TYPE:
          pdu = new OrphanedPdu();
          break;
        case RequestCoPdu.REQUEST_TYPE:
          pdu = new RequestCoPdu();
          break;
        case ResponseCoPdu.RESPONSE_TYPE:
          pdu = new ResponseCoPdu();
          break;
        case ShutdownPdu.SHUTDOWN_TYPE:
          pdu = new ShutdownPdu();
          break;
        default:
          throw new Error("Unknown PDU type: 0x" + String(type));
      }

      bufferTobeUsed.setIndex(0);
      pdu.decode(ndr, bufferTobeUsed);
      return pdu;
    }else{
      throw new Error("Socket Closed");
    }
  }

  isValidType(type)
  {
    switch (type) {
      case AlterContextPdu.ALTER_CONTEXT_TYPE:
      case AlterContextResponsePdu.ALTER_CONTEXT_RESPONSE_TYPE:
      case Auth3Pdu.AUTH3_TYPE:
      case BindPdu.BIND_TYPE:
      case BindAcknowledgePdu.BIND_ACKNOWLEDGE_TYPE:
      case BindNoAcknowledgePdu.BIND_NO_ACKNOWLEDGE_TYPE:
      case CancelCoPdu.CANCEL_TYPE:
      case FaultCoPdu.FAULT_TYPE:
      case OrphanedPdu.ORPHANED_TYPE:
      case RequestCoPdu.REQUEST_TYPE:
      case ResponseCoPdu.RESPONSE_TYPE:
      case ShutdownPdu.SHUTDOWN_TYPE:
        return true;
      default:
        return false;
    }
  }

  processIncoming(buffer)
  {
    buffer.setIndex(ConnectionOrientedPdu.TYPE_OFFSET);
    var logMsg = true;
    switch (buffer.dec_ndr_small()) {
      case BindAcknowledgePdu.BIND_ACKNOWLEDGE_TYPE:
        if (logMsg){
          console.log("Received BIND_ACK");
          logMsg = false;
        }
      case AlterContextResponsePdu.ALTER_CONTEXT_RESPONSE_TYPE:
        if (logMsg){
          console.log("Received ALTER_CTX_RESP");
          logMsg = false;
        }
      case BindPdu.BIND_TYPE:
        if (logMsg){
          console.log("Received BIND");
          logMsg = false;
        }
      case AlterContextPdu.ALTER_CONTEXT_TYPE:
        if (logMsg){
          console.log("Received ALTER_CTX");
          logMsg = false;
        }
        var verifier = this.detachAuthentication(buffer);
        if (verifier != null){
          this.incomingRebind(verifier);
        }
        break;
      case FaultCoPdu.FAULT_TYPE:
        if (logMsg){
          console.log("Received FAULT");
          logMsg = false;
        }
      case CancelCoPdu.CANCEL_TYPE:
        if (logMsg){
          console.log("Received CANCEL");
          logMsg = false;
        }
      case OrphanedPdu.ORPHANED_TYPE:
        if (logMsg){
          console.log("Received ORPHANED");
          logMsg = false;
        }
      case ResponseCoPdu.RESPONSE_TYPE:
        if (logMsg) {
          console.log("Received RESPONSE");
          logMsg = false;
        }
      case RequestCoPdu.REQUEST_TYPE:
        if (logMsg) {
          console.log("Received REQUEST");
          logMsg = false;
        }

        if (security != null){
          var ndr2 = new NetworkDataRepresentation();
          ndr2.setBuffer(buffer);
          this.verifyAndUnseal(ndr2);
        }else{
          this.detachAuthentication(buffer);
        }
        break;
      case Auth3Pdu.AUTH3_TYPE:
        if (logMsg) {
          logMsg = false;
        }
        incomingRebind(detatchAuthentication2(buffer));
        break;
      case BindNoAcknowledgePdu.BIND_NO_ACKNOWLEDGE_TYPE:
      case ShutdownPdu.SHUTDOWN_TYPE:
        return;
      default:
        throw new Error("Invalid incoming PDU type");
    }
  }

  processOutgoing()
  {
    this.ndr.setIndex(ConnectionOrientedPdu.TYPE_OFFSET);
    var logMsg = true;
    switch (this.ndr.readUnsignedSmall()) {
      case Auth3Pdu.AUTH3_TYPE:
        if (logMsg) {
          console.log("Sending AUTH3");
          logMsg = false;
        }
      case BindAcknowledgePdu.BIND_ACKNOWLEDGE_TYPE:
        if (logMsg){
          console.log("Sending BIND_ACK");
          logMsg = false;
        }
      case AlterContextResponsePdu.ALTER_CONTEXT_RESPONSE_TYPE:
        if (logMsg){
          console.log("Sending ALTER_CTX_RESP");
          logMsg = false;
        }

        var verifier = this.outgoingRebind();
        if (verifier != null) this.attachAuthentication(verifier);
        break;
      case BindPdu.BIND_TYPE:
        if (logMsg){
          console.log("Sending BIND");
          logMsg = false;
        }
      case AlterContextPdu.ALTER_CONTEXT_TYPE:
        if (logMsg){
          console.log("Sending ALTER_CTX");
          logMsg = false;
        }
        break;
      case FaultCoPdu.FAULT_TYPE:
        if (logMsg){
          console.log("Sending FAULT");
          logMsg = false;
        }
      case CancelCoPdu.CANCEL_TYPE:
        if (logMsg){
          console.log("Sending CANCEL");
          logMsg = false;
        }
      case OrphanedPdu.ORPHANED_TYPE:
        if (logMsg){
          console.log("Sending ORPHANED");
          logMsg = false;
        }
      case ResponseCoPdu.RESPONSE_TYPE:
        if (logMsg) {
          console.log("Sending RESPONSE");
          logMsg = false;
        }
        if (security != null) {
          this.signAndSeal(this.ndr);
        }
        break;
      case RequestCoPdu.REQUEST_TYPE:
        if (logMsg) {
          console.log("Sending REQUEST");
          logMsg = false;
        }

        if (security != null){
          var ndr2 = new NetworkDataRepresentation();
          ndr2.setBuffer(buffer);
          this.verifyAndUnseal(ndr2);
        }else{
          this.detachAuthentication(buffer);
        }
        break;
      case BindNoAcknowledgePdu.BIND_NO_ACKNOWLEDGE_TYPE:
      case ShutdownPdu.SHUTDOWN_TYPE:
        return;
      default:
        throw new Error("Invalid outgoing PDU type");
    }
  }

  set security(security)
  {
    this.security = security;
  }

  attachAuthentication(verifier)
  {
    try{
      var buffer = this.ndr.getBuffer();
      var length = buffer.getLength();
      buffer.setIndex(length);
      verifier.encode(ndr, buffer);
      length = buffer.getLength();
      buffer.setIndex(ConnectionOrientedPdu.FRAG_LENGTH_OFFSET);
      this.ndr.writeUnsignedShort(length);
      this.ndr.writeUnsignedShort(verifier.body.length);
    }catch(e){
      throw new Error("Error attaching authentication to PDU");
    }
  }

  detatchAuthentication2(buffer)
  {
    try{
      buffer.setIndex(ConnectionOrientedPdu.AUTH_LENGTH_OFFSET);
      var length = buffer.dec_ndr_short();
      var index = 20;
      buffer.setIndex(index);
      var verifier = new AuthenticationVerifier(length);
      verifier.decode(ndr, buffer);
      buffer.setIndex(index + 2);
      length = index - buffer.dec_ndr_small();
      buffer.setIndex(ConnectionOrientedPdu.FRAG_LENGTH_OFFSET);
      buffer.enc_ndr_short(length);
      buffer.enc_ndr_short(0);
      buffer.setIndex(length);
      return verifier;
    }catch(e){
      throw new Error("Error striping authentication from PDU");
    }
  }

  detachAuthentication(buffer)
  {
    try {
      buffer.setIndex(ConnectionOrientedPdu.AUTH_LENGTH_OFFSET);
      var length = buffer.dec_ndr_short();

      if (length == 0) {
        return null;
      }

      var index = buffer.getLength() - length - 8;
      buffer.setIndex(index);
      var verifier = new AuthenticationVerifier(length);
      verifier.decode(ndr, buffer);
      buffer.setIndex(index + 2);
      length = index - buffer.dec_ndr_small();
      buffer.setIndex(ConnectionOrientedPdu.FRAG_LENGTH_OFFSET);
      buffer.enc_ndr_short(length);
      buffer.enc_ndr_short(0);
      buffer.setIndex(length);
      return verifier;
    } catch (e) {
      throw new Erro("Error striping authentication from PDU.");
    }
  }

  signAndSeal(ndr)
  {
    var protectionLevel = this.security.getProtectionLevel();

    if (protectionLevel < Security.PROTECTION_LEVEL_INTEGRITY) return;

    var verifierLength = this.security.getVerifierLength();
    var verifier = new AuthenticationVerifier(this.security.getAuthenticationService(),
      protectionLevel, this.contextId, verifierLength);
    var buffer = ndr.getBuffer();
    var length = buffer.getLength();

    buffer.setIndex(length);
    verifier.encode(ndr, buffer);
    length = buffer.getLength();
    buffer.setIndex(ConnectionOrientedPdu.FRAG_LENGTH_OFFSET);
    ndr.writeUnsignedShort(length);
    ndr.writeUnsignedShort(verifierLength);

    var verifierIndex = length - verifierLength;
    length = length - verifierLength + 8;

    var index = ConnectionOrientedPdu.HEADER_LENGTH;
    buffer.setIndex(ConnectionOrientedPdu.TYPE_OFFSET);
    switch (ndr.readUnsignedSmall()) {
      case RequestCoPdu.REQUEST_TYPE:
        index += 8;
        buffer.setIndex(connectionorientedpdu.FLAGS_OFFSET);
        if ((ndr.readUnsignedSmall() & ConnectionOrientedPdu.PFC_OBJECT_UUID) != 0){
          index += 16;
        }
        break;
      case FaultCoPdu.FAULT_TYPE:
        index += 16;
        break;
      case ResponseCoPdu.RESPONSE_TYPE:
        index += 8;
        break;
      case CancelCoPdu.CANCEL_TYPE:
      case OrphanedPdu.ORPHANED_TYPE:
        index = length;
        break;
      default:
        throw new Error("Not and authenticated PDU type.");
    }

    var isFragmented = true;
    buffer.setIndex(ConnectionOrientedPdu.FLAGS_OFFSET);
    var flags = ndr.readUnsignedSmall();
    if ((flags & ConnectionOrientedPdu.PFC_FIRT_FRAG) == ConnectionOrientedPdu.PFC_FIRT_FRAG &&
      (flags & ConnectionOrientedPdu.PFC_LAST_FRAG) == ConnectionOrientedPdu.PFC_LAST_FRAG) {
      isFragmented = false;
    }
    length = length - index;
    this.security.processOutgoing(ndr, index, length, verifierIndex, isFragmented);
  }

  verifyAndUnseal(ndr)
  {
    var buffer = ndr.getBuffer();
    buffer.setIndex(ConnectionOrientedPdu.AUTH_LENGTH_OFFSET);

    var verifierLength = ndr.readUnsignedShort();
    if (verifierLength <= 0) {
      return;
    }

    var verifierIndex = buffer.getLength() - verifierLength;
    var length = verifierIndex - 8;
    var index = ConnectionOrientedPdu.HEADER_LENGTH;

    buffer.setIndex(ConnectionOrientedPdu.TYPE_OFFSET);
    switch (ndr.readUnsignedSmall()) {
      case RequestCoPdu.REQUEST_TYPE:
        index += 8;
        buffer.setIndex(ConnectionOrientedPdu.FLAGS_OFFSET);
        if ((ndr.readUnsignedSmall() &
          ConnectionOrientedPdu.PFC_OBJECT_UUID) != 0) {
          index += 16;
        }
        break;
      case FaultCoPdu.FAULT_TYPE:
        index += 16;
        break;
      case ResponseCoPdu.RESPONSE_TYPE:
        index += 8;
        break;
      case CancelCoPdu.CANCEL_TYPE:
      case OrphanedPdu.ORPHANED_TYPE:
        index = length;
        break;
      default:
        throw new Error("Not an authenticated PDU type.");
    }
    length = length - index;

    var isFragmented = true;
    buffer.setIndex(ConnectionOrientedPdu.FLAGS_OFFSET);
    var flags = ndr.readUnsignedSmall();
    if ((flags & ConnectionOrientedPdu.PFC_FIRT_FRAG) ==
      ConnectionOrientedPdu.PFC_FIRT_FRAG && (flags & ConnectionOrientedPdu.PFC_LAST_FRAG) ==
      ConnectionOrientedPdu.PFC_LAST_FRAG) {
      isFragmented = false;
    }

    this.security.processIncoming(ndr, index, length, verifierIndex, isFragmented);
    buffer.setIndex(verifierIndex - 6);
    length = verifierIndex - ndr.readUnsignedSmall() - 8;
    buffer.setIndex(connectionorientedpdu.FRAG_LENGTH_OFFSET);
    ndr.writeUnsignedShort(length);
    ndr.writeUnsignedShort(0);
    buffer.length = length;
  }

  incomingRebind(verifier){};

  outgoingRebind()
  {
    return null;
  }
}

module.exports = DefaultConnection;