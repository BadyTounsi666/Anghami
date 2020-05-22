const{remote:remote}=require("electron"),{app:app,dialog:dialog}=remote,fs=require("fs"),path=require("path"),storage=require("electron-json-storage"),logger=require("../helpers/logger"),uploader=require("../helpers/uploader"),isWindows="win32"===process.platform,isMac="darwin"===process.platform,userTemporaryDirectory=path.join(app.getPath("temp"),".angh");class MatchMusicManager{constructor(){this.cumulativeFilesList=[],this.cumulativeMetadataList=[],this.numberOfFilesParsed=0,this.defaultMusicParseConfig={duration:!0,mergeTagHeaders:!0,skipCovers:!0,native:!1},this.ffmpegKilled=!1,this.currentPlatformFfmpegPath="",this.ffmpegCommand={},this.outputPath="",this.filePath="",setTimeout(()=>{this.handleFfmpegBinaryDecompression()},1e4)}uploadSong(e){this.resetFmmpegCommand(),this.filePath=e.local_path,isWindows&&(this.filePath=this.filePath.replace(/\//g,"\\")),fs.existsSync(this.filePath)?(this.outputPath=path.join(userTemporaryDirectory,Date.now().toString()+"-testup1.m4a"),fs.existsSync(this.outputPath)&&fs.unlinkSync(this.outputPath),fs.createWriteStream(this.outputPath),this.ffmpegCommand.input(this.filePath),this.ffmpegCommand.noVideo(),this.ffmpegCommand.audioBitrate(128),this.ffmpegCommand.toFormat("mp4"),this.ffmpegCommand.outputOption("-movflags frag_keyframe+faststart"),this.ffmpegCommand.output(this.outputPath),this.ffmpegCommand.on("error",this.ffmpegOperationOnError.bind(this)),this.ffmpegCommand.on("end",this.ffmpegOperationOnEnd.bind(this)),this.ffmpegCommand.run()):this.emitMessageToWebPlayer("match-music-song-uploaded",{originalFilePath:this.filePath,notFound:!0})}ffmpegOperationOnError(e){if(this.handleFfmpegBinaryDecompression(),!this.ffmpegKilled){let e=isWindows?this.filePath.replace(/\\/g,"/"):this.filePath;this.emitMessageToWebPlayer("match-music-song-uploaded",{originalFilePath:e,notFound:!0})}this.ffmpegKilled=!1,logger.logEvent(`[Song upload] An error occurred while processing file - ffmpeg: ${JSON.stringify(e)}`),logger.logEvent(`[Song upload] Song cancelled: ${this.filePath}`)}async ffmpegOperationOnEnd(e,t){logger.logEvent(`[Song upload] File done processing - ffmpeg path: ${this.outputPath} - path: ${this.filePath}`),this.parseFileMetadata(this.filePath,{skipCovers:!1}).then(e=>{const t=e;if(!t.error){const e=t.common.picture;if(e&&e.length>0){const t=e[0];let a=path.join(userTemporaryDirectory,`${Date.now().toString()}-img.${t.format.split("/")[1]}`);fs.writeFile(a,t.data,e=>{e?this.uploadSongFileToS3(this.outputPath,this.filePath):this.uploadSongFileToS3(this.outputPath,this.filePath,a)})}else this.uploadSongFileToS3(this.outputPath,this.filePath)}})}uploadSongFileToS3(e,t,a){uploader.uploadFile("ang-local-audio-file",e,"anghami.androidlogs",(e,i)=>{let s={};s.uploadedFilePath=i,s.originalFilePath=isWindows?t.replace(/\\/g,"/"):t,a&&fs.existsSync(a)?uploader.uploadFile("2",a,"anghami.androidlogs",e=>{s.uploadedImgFileUrl=e,this.emitMessageToWebPlayer("match-music-song-uploaded",s)}):this.emitMessageToWebPlayer("match-music-song-uploaded",s)})}resetFmmpegCommand(){const e=require("fluent-ffmpeg");this.ffmpegCommand=e(),this.ffmpegCommand.setFfmpegPath(this.currentPlatformFfmpegPath),logger.logEvent("[Match music] Ffmepg command has been reset")}openDialog(){const e=["openFile","multiSelections","showHiddenFiles"];isMac&&e.push("openDirectory");const t=remote.getCurrentWindow();dialog.showOpenDialog(t,{filters:[{name:"Music",extensions:["mp3","m4a","aac","flac","wav","wma","ogg"]}],properties:e}).then(e=>{e.canceled?logger.logEvent(`[Match music] File chooser dialog canceled - canceled: ${e.canceled}.`):e.filePaths&&e.filePaths.length>0&&(logger.logEvent(`[Match music] File chooser dialog chosen ${JSON.stringify(e.filePaths)}.`),this.emitMessageToWebPlayer("match-music-upload-start"),this.cumulativeFilesList=[],this.cumulativeMetadataList=[],this.numberOfFilesParsed=0,e.filePaths.forEach((e,t)=>{this.parseDirectoryContentsRecursively(e)}))})}parseDirectoryContentsRecursively(e){const t=fs.statSync(e);t.isFile()?this.isAllowedAudioFile(e)&&(this.cumulativeFilesList.push(e),this.parseFileMetadataAndOutput(e)):t.isDirectory()&&fs.readdir(e,(t,a)=>{a.forEach((t,a)=>{const i=path.join(e,"/",t);this.parseDirectoryContentsRecursively(i)})})}parseFileMetadataAndOutput(e){let t={localpath:e,title:path.basename(e,path.extname(e))};this.parseFileMetadata(e).then(a=>{const i=a;if(i.error)this.numberOfFilesParsed++,this.cumulativeMetadataList.push(t),logger.logEvent(`[Match music] File metadata err - File: ${e} - Error: ${err}`);else{const a=i.common,s=i.format;let o={name:(t={...t,...a}).title||path.basename(e,path.extname(e)),album:t.album||"",artist:t.artist||"",local_path:e};s.duration&&(o={...o,duration:s.duration.toFixed(2)}),this.cumulativeMetadataList.push(o),this.numberOfFilesParsed++}this.numberOfFilesParsed==this.cumulativeFilesList.length&&this.sendMachMusicFileListToWebPlayer(this.cumulativeMetadataList)}).catch(t=>{logger.logEvent(`[Match music] Error parsing metadata - File: ${e} - Error: ${t.message}`),this.numberOfFilesParsed++,this.numberOfFilesParsed==this.cumulativeFilesList.length&&this.sendMachMusicFileListToWebPlayer(this.cumulativeMetadataList)})}abortCurrentOperation(){this.ffmpegCommand&&this.ffmpegCommand.kill&&(this.ffmpegKilled=!0,this.ffmpegCommand.kill("SIGKILL"),logger.logEvent("[Match music] abortCurrentOperation - ffmpegCommand killed with signal: SIGKILL"))}sendMachMusicFileListToWebPlayer(e){this.emitMessageToWebPlayer("match-music-metadata-list",{list:e})}uploadMatchMusicFile(){let e=path.join(app.getPath("userData"),"storage","matchedMusic.json");uploader.uploadFile("matched-music",e,"anghami.androidlogs",(e,t)=>{this.emitMessageToWebPlayer("match-music-upload-done",{uploadPath:e}),storage.remove("matchedMusic.json",function(e){e?logger.logEvent(`[Match music] Error removing match music file - ERROR: ${JSON.stringify(e)}`):logger.logEvent("[Match music] Match music file removed successfully")})})}parseFileMetadata(e,t=this.defaultMusicParseConfig){let a=require("music-metadata").parseFile(e,t);return a.catch(e=>({error:!0,message:e.message})),a}isAllowedAudioFile(e){return{".mp3":!0,".m4a":!0,".aac":!0,".ogg":!0,".wav":!0,".flac":!0,".wma":!0}[path.extname(e).toLowerCase()]}unzip(e,t){new(require("decompress-zip"))(e).extract({path:t})}handleFfmpegBinaryDecompression(){let e=-1==require("compare-versions")(require("os").release(),"16.0.0"),t=path.join(__dirname,"..","..","assets","bin").replace("app.asar","app.asar.unpacked"),a=path.join(t,"ffmpeg.exe"),i=e?path.join(t,"ffmpeg-mac-old"):path.join(t,"ffmpeg-mac");if(isMac){if(!fs.existsSync(i)){let a=e?path.join(t,"ffmpeg-mac-old.zip"):path.join(t,"ffmpeg-mac.zip");this.unzip(a,t)}}this.currentPlatformFfmpegPath=isMac?i:a}emitMessageToWebPlayer(e,t={}){global._desktopSource.next({action:e,payload:t})}}module.exports=MatchMusicManager;