let mediaRecorder; //媒體錄製器對象，用於錄製音訊
let audioContext; //音頻上下文對象，用於音頻處理
let analyser; //音頻分析器，用於分析音頻
let dataArray; //數組，用於儲存音頻數據
let gainNode; //音量節點，用於控制音量
let chunks = []; //數組，用於儲存音訊片段
let volumeBar; //音量條對象，用於顯示音量
let volumeThreshold = 10; //音量閾值，用於檢測是否有語音信號
let minSilenceDuration = 0.5; //最小靜音持續時間，用於檢測語音信號結束
let segmentDuration = 25; //音訊片段持續時間，用於將音訊分割成多個片段
let micStream; // 用於存儲麥克風音頻流
let systemStream; // 用於存儲系統音頻流
let silenceStart = null; //靜音開始時間
let lastChunkEndTime = 0; //上一個音訊片段的結束時間
let destinationNode; // 定義一個變量來存儲目標節點，用於錄音
let stream; // 定義一個變量來存儲音訊流
let isRecordingStopped = false; // 定義一個變量，表示錄音是否已停止
let scriptProcessorNode;

//const audioContext = new (window.AudioContext || window.webkitAudioContext)();

// 更新按鈕狀態等界面元素
function updateUIWhilePaused() {
    
    // 獲取暫停按鈕的 DOM 元素
    const pauseBtn = document.getElementById('pauseBtn'); 

    // 如果暫停按鈕存在，則更新按鈕文字為 "繼續錄音"
    if (pauseBtn) {
        pauseBtn.textContent = "繼續錄音"; 
    }
}

//開始錄音功能
async function startRecording() {
    
    let recording = [];

    // 定義一個變量，表示錄音是否已停止
    isRecordingStopped = false;
    
    try {
        
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.error('This browser does not support WebRTC');
            return;
        }
        
        // 創建 AudioContext，用於處理和控制 Web 音頻
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const stream = await navigator.mediaDevices.getUserMedia({audio: true});

        // 初始化音訊片段數組
        chunks = [];

        // 獲取用戶麥克風音訊流
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });

        // 獲取系統音訊流
        const systemStream = await navigator.mediaDevices.getDisplayMedia({ audio: true });

        // 創建分析器節點，用於提取音頻數據
        analyser = audioContext.createAnalyser();

        // 創建用戶麥克風音訊源節點
        const micSourceNode = audioContext.createMediaStreamSource(micStream);

        // 創建系統音訊源節點
        const systemSourceNode = audioContext.createMediaStreamSource(systemStream);

        // 創建增益節點，用於調整音量
        gainNode = audioContext.createGain();

        // 創建 ScriptProcessor 節點，用於處理音訊數據
        const destinationNode = audioContext.createScriptProcessor(4096, 1, 1);

        // 新增輸出音量節點
        const outputGainNode = audioContext.createGain();

        // 新增 MediaStreamDestination 節點，用於將音訊流合併
        const mediaStreamDestination = audioContext.createMediaStreamDestination();

        // 連接用戶麥克風音訊源節點、增益節點和輸出音量節點
        micSourceNode.connect(gainNode);
        gainNode.connect(outputGainNode)

        // 連接系統音訊源節點和輸出音量節點
        systemSourceNode.connect(outputGainNode);

        // 連接輸出音量節點和 MediaStreamDestination 節點
        outputGainNode.connect(mediaStreamDestination);

        // 連接輸出音量節點和 ScriptProcessor 節點
        outputGainNode.connect(destinationNode);

        // 連接 ScriptProcessor 節點和 AudioContext 的 destination，使音訊可以播放
        destinationNode.connect(audioContext.destination);

        // 將合併後的音訊流轉換為 MediaStream，僅包含音訊軌道
        const combinedStream = new MediaStream([...mediaStreamDestination.stream.getAudioTracks()]);

        // 設定錄音格式，如果支援的話，使用 'audio/wav' 格式
        const options = MediaRecorder.isTypeSupported('audio/wav') ? { mimeType: 'audio/wav' } : undefined;

        // 使用合併後的音訊流和選項創建 MediaRecorder
        mediaRecorder = new MediaRecorder(combinedStream, options);

        // 初始化用於存儲音訊緩衝區的數組
        let slicedAudioBuffers = [];

        // 當錄音停止時的回調函數
        mediaRecorder.onstop = async () => { 
            
            // 停止所有音軌
            systemStream.getTracks().forEach(track => track.stop()); 

            // 使用 chunks 數據創建最終的 Blob 音訊文件
            const finalBlob = new Blob(chunks, { type: 'audio/webm' });    

            // 使用函數1將音訊轉換為浮點數數組
            const float32Array = await wavToFloat32Array(finalBlob);
            console.log("Converted WAV to Float32Array:", float32Array);

            // 2 音訊降噪
            const denoisedArray = await denoiseAudio(float32Array);
            console.log("Denoised Float32Array:", denoisedArray);

            //3 增強語音信號
            const enhancedArray = await enhanceSpeech(denoisedArray);
            console.log("Enhanced Float32Array:", enhancedArray);

            // 4 音量正規化
            const normalizedArray = await normalizeVolume(enhancedArray);
            console.log("Normalized Float32Array:", normalizedArray);

            ///5 頻率範圍過濾
            const filteredArray = await filterFrequencyRange(normalizedArray, 300, 3400);
            console.log("Filtered Float32Array:", filteredArray);

            //6  語音檢測
            const speechDetected = detectSpeech(filteredArray, volumeThreshold);
            console.log("Speech Detected:", speechDetected);

            //7 語音分段
            const speechSegments = splitSpeech(filteredArray, speechDetected, minSilenceDuration, audioContext.sampleRate);
            console.log("Speech Segments:", speechSegments);

            // 使用函數9將浮點數數組轉換回適合傳輸的格式
            const processedWavBlob = await float32ArrayToWavBlob(normalizedArray);
            console.log("Converted Float32Array to WAV Blob:", processedWavBlob);            

            // 下載處理後的音訊
            downloadBlob(processedWavBlob, `processed_audio.wav`);
        };
        
        // 當可用數據時的回調函數
        mediaRecorder.ondataavailable = (event) => { 
            
            // 如果事件中的數據大小大於 0
            if (event.data.size > 0) { 
                // 將數據添加到 chunks 數組中
                chunks.push(event.data); 
            }
        };      
        
        // 開始錄音，每隔 1000 毫秒 = 1 秒觸發一次 ondataavailable 事件
        mediaRecorder.start(1000); 

        // 更新界面元素，顯示正在錄音的狀態
        updateUIWhileRecording(); 

    // 捕獲異常
    } catch (error) {
        
        // 輸出錯誤信息
        console.error("錯誤: ", error);

        // 彈出提示，讓用戶知道錄音無法開始
        alert("無法開始錄製，請檢查設備並重試。");
    }

    // 創建 AudioContext 實例
    const audioContext = new AudioContext();

    // 創建 ScriptProcessorNode 來實時處理音訊數據
    scriptProcessorNode = audioContext.createScriptProcessor(4096, 1, 1);

    // 連接節點
    navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
        const mediaStreamSource = audioContext.createMediaStreamSource(stream);
        mediaStreamSource.connect(scriptProcessorNode);
        scriptProcessorNode.connect(audioContext.destination);
    });

    // 監聽 onaudioprocess 事件
    scriptProcessorNode.onaudioprocess = processAudio;

    // 標記錄音已開始
    recording = true;

}

// 根據音訊數據計算平均音量
function getAverageVolume(array) {
    
    let sum = 0; // 初始化總和為0
    let count = 0; // 初始化計數為0

    // 遍歷音訊數據數組
    for (let i = 0; i < array.length; i++) {
        sum += Math.abs(array[i]); // 將音訊數據的絕對值加到總和中
        count++; // 增加計數
    }

    // 返回平均音量
    return sum / count; 
}

// 在錄製過程中更新界面元素的函數
function updateUIWhileRecording() {
    
    // 更新按鈕狀態等界面元素
    // 獲取暫停按鈕元素
    const pauseBtn = document.getElementById('pauseBtn'); 
    
    if (pauseBtn) {
        // 設置暫停按鈕的文本內容
        pauseBtn.textContent = "暫停錄音"; 
    }
}

// 停止錄音的函數
async function stopRecording() {

    // 設置錄音停止標記為 true
    isRecordingStopped = true;

    // 停止音訊
    if (micStream) {
        micStream.getTracks().forEach(function (track) {
            track.stop();// 停止每個麥克風音軌
        });
    }

    if (systemStream) {
        systemStream.getTracks().forEach(function (track) {
            track.stop();// 停止每個系統音軌
        });
    }

    //console.log("Audio tracks stopped.");

    // 停止錄音
    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();// 停止 MediaRecorder
    }

    // 等待錄音完全停止
    await new Promise((resolve, reject) => {
        
        // 監聽停止事件並解析 Promise
        mediaRecorder.addEventListener('stop', resolve, { once: true }); 
        mediaRecorder.addEventListener('error', (error) => {
            console.error('MediaRecorder error:', error); // 輸出錯誤信息
            reject(error); // 拒絕 Promise
        }, { once: true });
    });

    //console.log("Promise resolved.");

    try {
        // 保存音頻
        const blob = new Blob(chunks, { type: 'audio/webm' });
    
        // 修改後的部分：判斷音頻數據是否為空，若不為空則進行保存
        if (blob.size > 0) {
            // 根據音頻 Blob 對象創建一個 URL
            const url = URL.createObjectURL(blob); 
            
            // 創建一個隱藏的 <a> 標籤元素
            const a = document.createElement('a');

            // 將 <a> 標籤隱藏
            a.style.display = 'none';

            // 將 <a> 標籤的 href 設為音頻 URL
            a.href = url; 

            // 為下載的音頻文件命名
            a.download = `recording-${Date.now()}.webm`; 

            // 將 <a> 標籤添加到文檔中
            document.body.appendChild(a); 
            
             // 模擬點擊 <a> 標籤，觸發下載操作
             a.click();

            setTimeout(() => {
                
                // 在延遲後刪除 <a> 標籤
                document.body.removeChild(a);
                
                // 釋放創建的音頻 URL
                URL.revokeObjectURL(url); 

            }, 100);
        }
    
        // 重置錄音相關變量和界面元素
        chunks = [];
        mediaRecorder = null;
        micStream = null;
        systemStream = null;
        updateUIAfterRecording();
    } catch (error) {
        console.error("Error after MediaRecorder stopped:", error);
    }
    
    // 斷開節點並停止錄音
    scriptProcessorNode.disconnect(audioContext.destination);
    audioContext.close();

    // 標記錄音已停止
    recording = false;

}

// 錄音結束後更新界面元素的函數
function updateUIAfterRecording() {
    // 更新按鈕狀態等界面元素
}

function pauseRecording() {
   
    if (isRecordingStopped) {
        return;
    }
    
    if (mediaRecorder && mediaRecorder.state === "recording") {
        
        // 暫停 MediaRecorder
        mediaRecorder.pause(); 
        
        // 將麥克風輸入音量設為 0
        gainNode.gain.value = 0; 
        
        // 更新暫停時的界面元素
        updateUIWhilePaused(); 

    } else if (mediaRecorder && mediaRecorder.state === "paused") {
        
        // 恢復 MediaRecorder
        mediaRecorder.resume();

        // 將麥克風輸入音量設回正常
        gainNode.gain.value = 1; 
        
        
        // 更新錄音時的界面元素
        updateUIWhileRecording(); 
    }
     else {
        console.error("MediaRecorder 狀態不正確: ", mediaRecorder.state);
    }
}

// 此函數用於恢復錄音
function resumeRecording() {
    
    // 輸出當前 MediaRecorder 是否正在錄音
    console.log('MediaRecorder isRecording:', mediaRecorder.isRecording());
   
    // 如果 MediaRecorder 存在並且當前狀態為暫停，則恢復錄音
    if (mediaRecorder && mediaRecorder.state === "paused") {
        mediaRecorder.resume();
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    
    // 獲取各個按鈕的 DOM 元素
    const startBtn = document.getElementById('startBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    let buffer;

        // 如果 startBtn 存在，為其添加 click 事件監聽器
        if (startBtn) {
            startBtn.addEventListener('click', () => {
                // 如果 MediaRecorder 不存在，或者存在但未開始錄音，則開始錄音
                if (!mediaRecorder || (mediaRecorder && !mediaRecorder.isRecording())) {
                    startRecording();
                    // 更新按鈕的禁用狀態
                    pauseBtn.disabled = false;
                    stopBtn.disabled = false;
                    startBtn.disabled = true;
                }
            });
        }
        // 如果 startBtn 不存在，輸出錯誤信息
        else {
            console.error('Cannot find element with id "startBtn"');
        }
    
        // 如果 pauseBtn 存在，為其添加 click 事件監聽器
        if (pauseBtn) {
            pauseBtn.addEventListener('click', () => {
                // 點擊時暫停錄音
                pauseRecording();
            });
        }

        // 如果 pauseBtn 不存在，輸出錯誤信息
        else {
            console.error('Cannot find element with id "pauseBtn"');
        }
    
        // 獲取 stopBtn 的 DOM 元素
        const stopBtn = document.getElementById('stopBtn');
    
        // 如果 stopBtn 存在，為其添加 click 事件監聽器
        if (stopBtn) {
            stopBtn.addEventListener('click', () => {
                // 點擊時停止錄音
                stopRecording();
            });
        }

        // 如果 stopBtn 不存在，輸出錯誤信息
        else {
            console.error('Cannot find element with id "stopBtn"');
        }

});

// 定義一個非同步函數 sliceAudio，將音訊切割成多個片段
async function sliceAudio(blob, volumeThreshold, minSilenceDuration) {
   
    // 將傳入的音訊 blob 轉換成 AudioBuffer 對象
    const audioBuffer = await new Promise((resolve, reject) => {
        
        // 創建一個具有 audio/wav 類型的 Response 對象
        const response = new Response(blob, { type: 'audio/wav' });
       
        // 將 Response 對象轉換成 ArrayBuffer
        response.arrayBuffer().then((data) => {
           
            // 使用 audioContext 將 ArrayBuffer 解碼成 AudioBuffer
            audioContext.decodeAudioData(data, (decodedData) => {
            
                // 解碼成功，將解碼後的 AudioBuffer 返回
                resolve(decodedData);
            }, (error) => {
             
                // 解碼失敗，輸出錯誤信息並返回 null
                console.error('Error decoding audio data:', error);
                reject(null);
            });
        });
    });

    // 如果解碼失敗，返回空數組
    if (!audioBuffer) {
        return [];
    }

    // 獲取 AudioBuffer 的聲道數據（單聲道）
    const channelData = audioBuffer.getChannelData(0);
    // 獲取音訊的採樣率
    const sampleRate = audioBuffer.sampleRate;
    // 計算最小靜音持續時間對應的採樣點數
    const minSilenceSamples = Math.floor(minSilenceDuration * sampleRate);
    // 計算音量閾值對應的數值
    const volumeThresholdValue = volumeThreshold / 100;

    // 初始化各種變量
    let startSample = 0;
    let endSample = 0;
    let silenceDuration = 0;
    let isSilent = false;

    // 存放切割後的音訊片段
    const slicedAudioBuffers = [];

    // 遍歷聲道數據中的每個採樣點
    for (let i = 0; i < channelData.length; i++) {
        
        // 獲取當前採樣點的數值
        const sample = channelData[i];

        // 判斷當前採樣點是否低於音量閾值
        const isSampleSilent = Math.abs(sample) < volumeThresholdValue;

        if (!isSilent && isSampleSilent) {
            // 如果之前的音訊不是靜音，且當前取樣為靜音，則將靜音持續時間設為1，並將 isSilent 設為 true
            silenceDuration = 1;
            isSilent = true;
        } else if (isSilent && isSampleSilent) {
            
            // 如果之前的音訊為靜音，且當前取樣仍為靜音，則靜音持續時間加1
            silenceDuration++;

        } else if (isSilent && !isSampleSilent) {
           
            // 如果之前的音訊為靜音，且當前取樣不再為靜音，檢查靜音持續時間是否達到最小靜音持續時間
            if (silenceDuration >= minSilenceSamples) {
                
                // 如果達到，則將 endSample 設為靜音段的開始位置，然後創建一個新的音訊片段
                endSample = Math.max(startSample, i - silenceDuration);
               
                if (endSample - startSample > 0) {
                    const sliceBuffer = audioContext.createBuffer(1, endSample - startSample, sampleRate);
                    sliceBuffer.copyToChannel(channelData.subarray(startSample, endSample), 0);
                    slicedAudioBuffers.push(sliceBuffer);
                    startSample = i;
                }
            }

            // 將 isSilent 設回為 false，表示結束靜音段
            isSilent = false;
        }
    }

    if (startSample < channelData.length && channelData.length - startSample >= sampleRate) { // 修改這一行
        
        // 如果最後一個非靜音片段的開始位置小於音訊長度，並且剩餘音訊長度大於等於一個取樣率，則創建一個新的音訊片段
        const sliceBuffer = audioContext.createBuffer(1, channelData.length - startSample, sampleRate);
        sliceBuffer.copyToChannel(channelData.subarray(startSample, channelData.length), 0);
        slicedAudioBuffers.push(sliceBuffer);
    }
    
    // 返回所有切割後的音訊片段
    return slicedAudioBuffers;
}

function downloadBlob(blob, filename) {
    
    // 創建一個指向傳入的 Blob 物件的 URL
    const url = window.URL.createObjectURL(blob);
    
    // 創建一個隱藏的超連結元素
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    
    // 設置下載檔案的檔名
    a.download = filename;
    
    // 將超連結元素添加到頁面上
    document.body.appendChild(a);
    
    // 觸發超連結元素的 click 事件，開始下載
    a.click();

    // 設置一個 100 毫秒的定時器，用於移除網頁上的 <a> 元素，並釋放 URL 對象
    setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }, 100);
}

// 函數 - 將 AudioBuffer 轉換為 Blob 對象
async function bufferToBlob(audioBuffer) {

    // 創建一個新的 BufferSource    
    const bufferSource = audioContext.createBufferSource();
    bufferSource.buffer = audioBuffer;

    // 創建一個 MediaStreamAudioDestinationNode
    const mediaStreamDestination = audioContext.createMediaStreamDestination();
   
    // 將 BufferSource 連接到 MediaStreamAudioDestinationNode
    bufferSource.connect(mediaStreamDestination);

    // 使用 MediaStreamAudioDestinationNode 的 stream 作為 MediaRecorder 的參數
    const recorder = new MediaRecorder(mediaStreamDestination.stream);
 
    // 創建一個 chunks 陣列，用於保存 MediaRecorder 捕獲的音訊數據
    const chunks = [];

    // 監聽 MediaRecorder 的 ondataavailable 事件，將捕獲到的音訊數據存入 chunks 陣列
    recorder.ondataavailable = (event) => {
        chunks.push(event.data);
    };

    // 開始錄音並播放音訊
    recorder.start();
    bufferSource.start();

    // 等待 MediaRecorder 停止錄音
    await new Promise((resolve) => {
        recorder.onstop = resolve;
        recorder.addEventListener('error', (event) => {
            console.error('MediaRecorder error:', event.error);
        }, { once: true });
    });

    // 使用 chunks 陣列創建一個 Blob 對象
    const blob = new Blob(chunks, { type: 'audio/wav' });
    return blob;
}

// 函數 - 將 AudioBuffer 轉換為 Blob
async function convertAudioBufferToBlob(audioBuffer) {
    return await bufferToBlob(audioBuffer);
}

// 函數 - 將 Blob 轉換為 AudioBuffer
async function convertBlobToAudioBuffer(blob) {

    // 將 Blob 對象轉換為 ArrayBuffer
    const arrayBuffer = await new Response(blob).arrayBuffer();

    // 使用 AudioContext 的 decodeAudioData 方法將 ArrayBuffer 轉換為 AudioBuffer
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    return audioBuffer;
}

// 函數1：將WAV格式音訊轉換為浮點數數組
async function wavToFloat32Array(blob) {

    // 將 Blob 物件轉換為 ArrayBuffer 物件
    const arrayBuffer = await blob.arrayBuffer(); 
    
    // 將 ArrayBuffer 物件解碼為 AudioBuffer 物件
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer); 
    
    // 從 AudioBuffer 物件中獲取浮點數數組（Float32Array）
    const float32Array = audioBuffer.getChannelData(0); 
    
    // 返回浮點數數組
    return float32Array; 
}

// 函數9：將浮點數數組轉換回適合傳輸的格式（Blob）
async function float32ArrayToWavBlob(float32Array) {
    
    // 創建一個 AudioBuffer 物件，並設置通道數、長度和採樣率
    const audioBuffer = audioContext.createBuffer(1, float32Array.length, audioContext.sampleRate); 
    
    // 將浮點數數組複製到 AudioBuffer 物件的第 0 通道
    audioBuffer.copyToChannel(float32Array, 0); 
    
    // 將 AudioBuffer 物件轉換為 Blob 物件（WAV 格式）
    const wavBlob = await bufferToBlob(audioBuffer); 
    
    // 返回 Blob 物件
    return wavBlob; 
}

// 音訊降噪
async function denoiseAudio(float32Array) {
   
    // 定義降噪強度
    const noiseReduction = 0.95;
    // 初始化上一個音訊值
    let lastValue = 0;

    // 遍歷音訊數據
    for (let i = 0; i < float32Array.length; i++) {
        // 獲取當前音訊值
        const currentValue = float32Array[i];
        // 降噪處理：將當前音訊值與上一個音訊值的差值乘以降噪系數，並與當前音訊值相加
        float32Array[i] = currentValue + (lastValue - currentValue) * noiseReduction;
        // 更新上一個音訊值
        lastValue = float32Array[i];
    }

    // 輸出處理後的音訊數據
    console.log("Denoised audio:", float32Array);
   
    // 返回處理後的音訊數據
    return float32Array;
}

// 增強語音信號
async function enhanceSpeech(float32Array) {
    
    // 定義增益值
    const gain = 1.5;

    // 遍歷音訊數據，對每個值乘以增益值
    for (let i = 0; i < float32Array.length; i++) {
        float32Array[i] *= gain;
    }

    // 輸出處理後的音訊數據
    console.log("Enhanced audio:", float32Array);
    
    // 返回處理後的音訊數據
    return float32Array;
}

// 音量正規化
async function normalizeVolume(float32Array) {
    
    // 初始化最大音量值
    let max = 0;

    // 遍歷音訊數據，找出最大音量值
    for (let i = 0; i < float32Array.length; i++) {
        max = Math.max(max, Math.abs(float32Array[i]));
    }

    // 計算正規化因子
    const normalizationFactor = 1.0 / max;

    // 遍歷音訊數據，對每個值乘以正規化因子
    for (let i = 0; i < float32Array.length; i++) {
        float32Array[i] *= normalizationFactor;
    }

    // 輸出處理後的音訊數據
    console.log("Normalized audio:", float32Array);
    
    // 返回處理後的音訊數據
    return float32Array;
}

// 函數5：過濾指定頻率範圍的音訊信號
async function filterFrequencyRange(float32Array, lowFrequency, highFrequency) {
    
    // 創建一個離線音頻上下文
    const offlineContext = new OfflineAudioContext(1, float32Array.length, audioContext.sampleRate); 

    // 創建一個音頻源節點
    const source = offlineContext.createBufferSource(); 
    
    // 創建一個雙二階濾波器節點
    const filter = offlineContext.createBiquadFilter(); 
    
    // 設置濾波器類型為帶通
    filter.type = 'bandpass'; 
    
    // 設置濾波器的中心頻率
    filter.frequency.value = (lowFrequency + highFrequency) / 2; 
    
    // 設置濾波器的品質因數
    filter.Q.value = (highFrequency - lowFrequency) / filter.frequency.value; 

    // 創建一個 AudioBuffer 物件，並設置通道數、長度和採樣率
    const audioBuffer = offlineContext.createBuffer(1, float32Array.length, audioContext.sampleRate); 
    
    // 將浮點數數組設置到 AudioBuffer 物件的第 0 通道
    audioBuffer.getChannelData(0).set(float32Array); 

    // 將 AudioBuffer 物件設置為音頻源節點的
    source.buffer = audioBuffer; 

    // 將音源（source）連接到濾波器（filter）
    source.connect(filter);

    // 將濾波器（filter）連接到離線音頻上下文的目標（destination）
    filter.connect(offlineContext.destination);

    // 開始播放音源（source）
    source.start(0);

    // 開始渲染離線音頻上下文並獲取渲染後的音頻數據緩衝區（renderedBuffer）
    const renderedBuffer = await offlineContext.startRendering();

    // 從渲染後的音頻緩衝區中獲取單聲道音頻數據並返回
    return renderedBuffer.getChannelData(0);
}

// 函數6：語音檢測
function detectSpeech(float32Array, threshold) {
    
    // 創建一個布爾數組，表示音頻數據中的每個樣本是否為語音
    const isSpeech = new Array(float32Array.length).fill(false);

    // 遍歷音頻數據中的每個樣本
    for (let i = 0; i < float32Array.length; i++) {
       
        // 如果樣本的絕對值大於閾值，則將對應的布爾值設為 true
        if (Math.abs(float32Array[i]) > threshold) {
            isSpeech[i] = true;
        }
    }

    // 返回布爾數組，表示音頻數據中的每個樣本是否為語音
    return isSpeech;
}

// 函數7：語音分段
function splitSpeech(float32Array, isSpeech, minSilenceDuration, sampleRate) {
    
    // 初始化語音片段數組
    const segments = [];
    
    // 初始化語音開始索引
    let speechStart = -1;

  // 遍歷音頻數據中的每個樣本
  for (let i = 0; i < float32Array.length; i++) {
    
    // 如果當前樣本是語音
    if (isSpeech[i]) {
       
        // 如果語音開始索引尚未設置，則設置為當前索引
        if (speechStart === -1) {
            speechStart = i;
        }

        // 如果當前樣本不是語音且語音開始索引已設置
        } else if (speechStart !== -1) {
            
            // 計算靜音持續時間（單位：秒）
            const silenceDuration = (i - speechStart) / sampleRate;

            // 如果靜音持續時間大於等於最小靜音持續時間，則將語音片段添加到片段數組中
            if (silenceDuration >= minSilenceDuration) {
                segments.push({
                    
                    // 設定語音片段的開始位置
                    start: speechStart,

                    // 設定語音片段的結束位置
                    end: i
                });

                // 重置 speechStart 變數，用於檢測下一個語音片段
                speechStart = -1;
            }
        }
    }

    // 檢查是否有未完成的語音片段
    if (speechStart !== -1) {
        segments.push({
            
            // 設定未完成語音片段的開始位置
            start: speechStart,

            // 設定未完成語音片段的結束位置，即音訊數據的結尾
            end: float32Array.length
        });
    }

    // 返回找到的所有語音片段
    return segments;
}

let audioData = []; // 存儲音訊數據的數組

function processAudio(event) {

    let processedData = [];

    // 獲取音訊數據
    const inputBuffer = event.inputBuffer.getChannelData(0);

    let audioData = []; // 存儲音訊數據的數組
    let currentSegment = []; // 存儲當前音訊片段的數組
    let silenceDuration = 0; // 連續低於閾值的音量持續時間
  
  
    // 獲取音訊數據
    //const inputBuffer = event.inputBuffer.getChannelData(0);

    // 遍歷音訊數據，實現音量閾值切割和時間切割
    for (let i = 0; i < inputBuffer.length; i++) {
        
        const sample = inputBuffer[i];

        // 檢查音量是否低於閾值
        if (Math.abs(sample) < 0.01) {
        silenceDuration += 1 / audioContext.sampleRate;
        } else {
        silenceDuration = 0;
        }

        // 將音訊樣本添加到當前片段
        currentSegment.push(sample);

        // 檢查是否需要切割音訊
        const segmentDuration = currentSegment.length / audioContext.sampleRate;
        if (segmentDuration >= 30 || silenceDuration >= 0.5) {
        
        // 對當前片段進行前處理
        const processedSegment = preprocessAudioSegment(currentSegment);

        // 將處理後的音訊片段添加到音訊數據數組
        audioData.push(processedSegment);

        // 清空當前片段和連續低音量持續時間
        currentSegment = [];
        silenceDuration = 0;

        // 檢查點：在控制台打印處理後的音訊片段長度
        console.log('Processed audio segment length:', processedSegment.length);
        }
    }
  

     // 將處理後的音訊數據添加到數組中
    audioData.push(processedData);

    // 檢查點：在控制台打印處理後的音訊數據長度
    console.log('Processed audio data length:', audioData.length);
}

// 音訊前處理函數
function preprocessAudioSegment(segment) {
    // 1. 將音訊轉換為浮點數數組
    // segment 已經是一個浮點數數組，因此不需要進一步轉換
  
    // 2. 音訊降噪
    const denoisedSegment = denoiseAudio(segment);
  
    // 3. 增強語音信號
    const enhancedSegment = enhanceSpeech(denoisedSegment);
  
    // 4. 音量正規化
    const normalizedSegment = normalizeVolume(enhancedSegment);
  
    // 5. 頻率範圍過濾
    const filteredSegment = filterFrequencyRange(normalizedSegment);
  
    // 6. 語音檢測
    const speechDetectedSegment = detectSpeech(filteredSegment);
  
    // 7. 將浮點數數組轉換回適合傳輸的格式
    const processedSegment = float32ArrayToWavBlob(speechDetectedSegment);
  
    // 返回處理後的音訊片段
    return processedSegment;
  }

// 合併音訊數據
//const mergedAudioData = mergeAudioData(audioData);

// 將合併後的音訊數據發送至 OpenAI 進行語音轉文字
//sendToOpenAI(mergedAudioData);
