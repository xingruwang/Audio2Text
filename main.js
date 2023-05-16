let mediaRecorder; //媒體錄製器對象，用於錄製音訊
let audioContext; //音頻上下文對象，用於音頻處理
let analyser; //音頻分析器，用於分析音頻
let dataArray; //數組，用於儲存音頻數據
let gainNode; //音量節點，用於控制音量
let chunks = []; //數組，用於儲存音訊片段
let volumeBar; //音量條對象，用於顯示音量
let volumeThreshold = 10; //音量閾值，用於檢測是否有語音信號
let minSilenceDuration = 0.5; //最小靜音持續時間，用於檢測語音信號結束
let segmentDuration = 30; //音訊片段持續時間，用於將音訊分割成多個片段
let micStream; // 用於存儲麥克風音頻流
let systemStream; // 用於存儲系統音頻流
let silenceStart = null; //靜音開始時間
let lastChunkEndTime = 0; //上一個音訊片段的結束時間
let destinationNode; // 定義一個變量來存儲目標節點，用於錄音
let stream; // 定義一個變量來存儲音訊流
let isRecordingStopped = false; // 定義一個變量，表示錄音是否已停止
let scriptProcessorNode;
let recording = false; // 在全局範圍內定義錄音變量
let samples = []; // 存儲音訊樣本的數組
let minVolume = Infinity; // 初始化最小音量
let volumeThreshold_1 = 0; // 音量閥值
//const axios = require('axios');// 引入axios
let transcript = '';// 儲存所有的語音辨識文字

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

    //console.log('開始錄音');

    // 監聽 onaudioprocess 事件
    scriptProcessorNode.onaudioprocess = (audioProcessingEvent) => processAudio(audioProcessingEvent, audioContext);   
    
    // 標記錄音已開始
    recording = true;

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
audioContext
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
    if (audioContext) {
        scriptProcessorNode.disconnect(audioContext.destination);
        audioContext.close();
    }

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
                stopRecording(audioContext);
            });
        }

        // 如果 stopBtn 不存在，輸出錯誤信息
        else {
            console.error('Cannot find element with id "stopBtn"');
        }

});

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

// 函數9：將浮點數數組轉換回適合傳輸的格式（Blob）
// 這是一個將浮點數數組轉換為WAV Blob對象的函數
async function float32ArrayToWavBlob(audioContext, float32Array) {
    // 創建一個AudioBuffer對象，並設置通道數、長度和採樣率
    const audioBuffer = audioContext.createBuffer(1, float32Array.length, audioContext.sampleRate);
    
    // 將浮點數數組複製到AudioBuffer對象的第0通道
    audioBuffer.copyToChannel(float32Array, 0);
    
    // 使用OfflineAudioContext渲染音頻數據
    const offlineAudioContext = new OfflineAudioContext({
        numberOfChannels: 1,
        length: float32Array.length,
        sampleRate: audioContext.sampleRate
    });
    const source = offlineAudioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineAudioContext.destination);
    source.start();
    const renderedBuffer = await offlineAudioContext.startRendering();
    
    // 將渲染後的音頻數據寫入WAV Blob對象
    const wavBlob = await bufferToWavBlob(renderedBuffer);
    
    // 返回Blob對象
    return wavBlob;
}

function bufferToWavBlob(buffer) {
    return new Promise((resolve, reject) => {
        const worker = new Worker(URL.createObjectURL(new Blob([`
        self.addEventListener('message', function(e) {
            const buffer = e.data;
            const numberOfChannels = buffer.numberOfChannels;
            const sampleRate = buffer.sampleRate;
            const length = buffer.length;
            const wavData = new DataView(new ArrayBuffer(44 + length * numberOfChannels * 2));
            const writeString = (view, offset, string) => {
                for (let i = 0; i < string.length; i++) {
                    view.setUint8(offset + i, string.charCodeAt(i));
                }
            };
            // 設置WAV頭部信息
            writeString(wavData, 0, 'RIFF');  // ChunkID
            wavData.setUint32(4, 36 + length * numberOfChannels * 2, true);  // ChunkSize
            writeString(wavData, 8, 'WAVE');  // Format
            writeString(wavData, 12, 'fmt ');  // Subchunk1ID
            wavData.setUint32(16, 16, true);  // Subchunk1Size
            wavData.setUint16(20, 1, true);  // AudioFormat
            wavData.setUint16(22, numberOfChannels, true);  // NumChannels
            wavData.setUint32(24, sampleRate, true);  // SampleRate
            wavData.setUint32(28, sampleRate * numberOfChannels * 2, true);  // ByteRate
            wavData.setUint16(32, numberOfChannels * 2, true);  // BlockAlign
            wavData.setUint16(34, 16, true);  // BitsPerSample
            writeString(wavData, 36, 'data');  // Subchunk2ID
            wavData.setUint32(40, length * numberOfChannels * 2, true);  // Subchunk2Size
            // 寫入音頻數據
            for (let i = 0; i < length; i++) {
                for (let channel = 0; channel < numberOfChannels; channel++) {
                    const sample = buffer.getChannelData(channel)[i];
                    const x = sample * 0x7FFF;
                    wavData.setInt16(44 + i * numberOfChannels * 2 + channel * 2, x, true);
                }
            }
            // 返回WAV數據
            self.postMessage({ wavData: wavData.buffer }, [wavData.buffer]);
            self.close();
        }, false);
        `])));
        worker.onmessage = function(e) {
            // 將ArrayBuffer轉換為Blob對象
            const wavBlob = new Blob([e.data.wavData], { type: 'audio/wav' });
            resolve(wavBlob);
        };
        worker.onerror = function(e) {
            reject(new Error(e.message));
        };
        // 提取 AudioBuffer 的通道數據到 Float32Array
        const channelData = [];
        for (let i = 0; i < buffer.numberOfChannels; i++) {
            channelData.push(buffer.getChannelData(i));
        }
        // 將音頻數據傳遞給 Worker
        worker.postMessage({
            numberOfChannels: buffer.numberOfChannels,
            sampleRate: buffer.sampleRate,
            length: buffer.length,
            channelData
        });
    });
}


// 音訊降噪
function denoiseAudio(float32Array) {
   
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
    //console.log("Denoised audio:", float32Array);
   
    // 返回處理後的音訊數據
    return float32Array;
}

// 增強語音信號
function enhanceSpeech(float32Array) {
    
    // 定義增益值
    const gain = 1.5;

    // 遍歷音訊數據，對每個值乘以增益值
    for (let i = 0; i < float32Array.length; i++) {
        float32Array[i] *= gain;
    }

    // 輸出處理後的音訊數據
    //console.log("Enhanced audio:", float32Array);
    
    // 返回處理後的音訊數據
    return float32Array;
}

// 音量正規化
function normalizeVolume(float32Array) {
    
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
    //console.log("Normalized audio:", float32Array);
    
    // 返回處理後的音訊數據
    return float32Array;
}

// 函數5：過濾指定頻率範圍的音訊信號
async function filterFrequencyRange(audioContext, float32Array, lowFrequency, highFrequency) {
    
    //console.log(audioContext);

    if (float32Array.length === 0) {
        // 如果為空，則直接返回原數組或者其他適當的預設值
        return float32Array;
    }

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

let audioData = []; // 存儲音訊數據的數組
let currentSegment = []; // 存儲當前音訊片段的數組

async function processAudio(audioProcessingEvent, audioContext) {
    //console.log('processAudio');

    const worker = new Worker(URL.createObjectURL(new Blob([`
    onmessage = function(e) {
      const { inputBuffer, audioContext } = e.data;
      let silenceDuration = 0;
      let currentSegment = [];
      let minVolume = Infinity;
      let volumeThreshold_1 = 0;
  
      for (let i = 0; i < inputBuffer.length; i++) {
        const sample = inputBuffer[i];
        minVolume = Math.min(minVolume, Math.abs(sample));
        if (i % audioContext.sampleRate === 0) {
          volumeThreshold_1 = minVolume * 1.1;
        }
        if (Math.abs(sample) < volumeThreshold_1) {
          silenceDuration += 1 / audioContext.sampleRate;
        } else {
          silenceDuration = 0;
        }
        currentSegment.push(sample);
        const segmentDuration = currentSegment.length / audioContext.sampleRate;
        if (segmentDuration >= 30 && silenceDuration >= 0.01) {
          console.log('切割');
          const segmentIndex = Math.floor(segmentDuration * audioContext.sampleRate);
          const segmentToProcess = currentSegment.slice(0, segmentIndex);
          currentSegment = currentSegment.slice(segmentIndex);
          silenceDuration = 0;
          postMessage(segmentToProcess);
        }
      }
    }
  `], { type: 'application/javascript' })));
  
  worker.onmessage = async function(e) {
    const segmentToProcess = e.data;
    const processedSegment = await preprocessAudioSegment(audioContext, segmentToProcess);
    
    
    audioData.push(processedSegment);
    transcribeAudio(processedSegment);
  }
  
  async function processAudio(audioProcessingEvent, audioContext) {
    const inputBuffer = audioProcessingEvent.inputBuffer.getChannelData(0);
    worker.postMessage({ inputBuffer, audioContext });
  }
}

// 音訊前處理函數
async function preprocessAudioSegment(audioContext, segment) {
    // 1. 將音訊轉換為浮點數數組
    // segment 已經是一個浮點數數組，因此不需要進一步轉換
  
    // 2. 音訊降噪
    const denoisedSegment = denoiseAudio(segment);
    //console.log('denoisedSegment length:', denoisedSegment.length);
  
    // 3. 增強語音信號
    const enhancedSegment = enhanceSpeech(denoisedSegment);
    //console.log('enhancedSegment length:', enhancedSegment.length);

    // 4. 音量正規化
    const normalizedSegment = normalizeVolume(enhancedSegment);
    //console.log('normalizedSegment length:', normalizedSegment.length);

    // 5. 頻率範圍過濾
    const lowFrequency = 300;
    const highFrequency = 3400;
    const filteredSegment = await filterFrequencyRange(audioContext, normalizedSegment, lowFrequency, highFrequency); 
    //console.log('filteredSegment length:', filteredSegment.length);

    // 6. 語音檢測
    //const speechDetectedSegment = detectSpeech(filteredSegment);
    //console.log('speechDetectedSegment length:', speechDetectedSegment.length);

    // 7. 將浮點數數組轉換回適合傳輸的格式
    const processedSegment = await float32ArrayToWavBlob(audioContext, filteredSegment);
    //console.log('processedSegment size:', processedSegment.size);

    // 返回處理後的音訊片段
    return processedSegment;
}

async function transcribeAudio(processedSegment) {
    try {
        // 讀取音頻檔案
        const base64Audio = processedSegment.toString('base64');

        // 向伺服器發送請求
        const response = await fetch('http://localhost:3000/transcribe', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ audio: base64Audio })
        });

        console.log('OpenAI Processing');

        // 解析伺服器的回應
        const data = await response.json();

        // 將辨識結果追加到全局變數中
        transcript += data.text;

        // 更新顯示元素的內容
        document.getElementById('transcript').textContent = transcript;
    } catch (error) {
        // 處理錯誤
        console.error(error);
    }
}
