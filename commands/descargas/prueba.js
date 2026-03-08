
import fs from "fs";
import path from "path";
import axios from "axios";
import yts from "yt-search";

const TMP_DIR = path.join(process.cwd(),"tmp");

if(!fs.existsSync(TMP_DIR))
fs.mkdirSync(TMP_DIR,{recursive:true});

function safeFileName(name){
return String(name||"audio")
.replace(/[\\/:*?"<>|]/g,"")
.slice(0,80)
}

async function getAudioFromPiped(videoId){

const {data} = await axios.get(`https://piped.video/api/v1/streams/${videoId}`,{
timeout:20000
});

const audio = data?.audioStreams?.find(v=>v.codec?.includes("opus"));

if(!audio) throw new Error("No audio stream");

return audio.url;
}

export default {

command:["play5"],
category:"descarga",

run: async(ctx)=>{

const {sock,from,args} = ctx;
const msg = ctx.m || ctx.msg;

if(!args.length){
return sock.sendMessage(from,{
text:"❌ Uso: .play canción"
});
}

let tempFile;

try{

const query = args.join(" ");

const search = await yts(query);

const video = search.videos[0];

if(!video){
return sock.sendMessage(from,{text:"❌ No encontré resultados"});
}

await sock.sendMessage(from,{
image:{url:video.thumbnail},
caption:`🎵 Descargando...\n\n${video.title}`
},{quoted:msg});

const videoId = video.url.split("v=")[1];

const audioUrl = await getAudioFromPiped(videoId);

tempFile = path.join(TMP_DIR,Date.now()+".webm");

const res = await axios({
url:audioUrl,
method:"GET",
responseType:"stream"
});

const writer = fs.createWriteStream(tempFile);

res.data.pipe(writer);

await new Promise(r=>writer.on("finish",r));

await sock.sendMessage(from,{
audio:{url:tempFile},
mimetype:"audio/webm",
fileName:safeFileName(video.title)+".webm"
},{quoted:msg});

}catch(err){

console.log("PLAY ERROR:",err);

sock.sendMessage(from,{
text:"❌ Error descargando música"
});

}finally{

setTimeout(()=>{
try{ if(tempFile && fs.existsSync(tempFile)) fs.unlinkSync(tempFile) }catch{}
},10000)

}

}

};
