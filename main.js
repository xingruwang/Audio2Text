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
let destinationNode;
let stream;
let isRecordingStopped = false;

function updateUIWhilePaused() {
    // 更新按鈕狀態等界面元素
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) {
        pauseBtn.textContent = "繼續錄音";
    }
}

// 修改後的 startRecording 函數
async function startRecording() {
    isRecordingStopped = false;
    try {
        audioContext = new AudioContext();
        chunks = [];
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const systemStream = await navigator.mediaDevices.getDisplayMedia({ audio: true });
        analyser = audioContext.createAnalyser();
        const micSourceNode = audioContext.createMediaStreamSource(micStream);
        const systemSourceNode = audioContext.createMediaStreamSource(systemStream);
        gainNode = audioContext.createGain();
        const destinationNode = audioContext.createScriptProcessor(4096, 1, 1);
        const outputGainNode = audioContext.createGain(); // 新增輸出音量節點
        const mediaStreamDestination = audioContext.createMediaStreamDestination(); // 新增 MediaStreamDestination 節點
        micSourceNode.connect(gainNode);
        gainNode.connect(outputGainNode);
        systemSourceNode.connect(outputGainNode);
        outputGainNode.connect(mediaStreamDestination);
        outputGainNode.connect(destinationNode);
        destinationNode.connect(audioContext.destination);
        const combinedStream = new MediaStream([...mediaStreamDestination.stream.getAudioTracks()]);// 改為只包含音訊軌道
        const options = MediaRecorder.isTypeSupported('audio/wav') ? { mimeType: 'audio/wav' } : undefined;
        mediaRecorder = new MediaRecorder(combinedStream, options);

        let slicedAudioBuffers = []; // 新增此行

        mediaRecorder.onstop = async () => {
            systemStream.getTracks().forEach(track => track.stop());
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
        
        // ... 保留 mediaRecorder.ondataavailable 和其他相關代碼
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                chunks.push(event.data);
            }
        };        
        
        //console.log("Chunks:", chunks);
        mediaRecorder.start(1000); // 1000毫秒 = 1秒
        updateUIWhileRecording();
    } catch (error) {
        console.error("錯誤: ", error);
        alert("無法開始錄製，請檢查設備並重試。");
    }
}

// 根據音訊數據計算平均音量
function getAverageVolume(array) {
    let sum = 0;
    let count = 0;

    for (let i = 0; i < array.length; i++) {
        sum += Math.abs(array[i]);
        count++;
    }

    return sum / count;
}

// 在錄製過程中更新界面元素的函數
function updateUIWhileRecording() {
    // 更新按鈕狀態等界面元素
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) {
        pauseBtn.textContent = "暫停錄音";
    }
}

// 停止錄音的函數
async function stopRecording() {
    //console.log("Stopping recording...");

    isRecordingStopped = true;

    // 停止音訊
    if (micStream) {
        micStream.getTracks().forEach(function (track) {
            track.stop();
        });
    }

    if (systemStream) {
        systemStream.getTracks().forEach(function (track) {
            track.stop();
        });
    }

    //console.log("Audio tracks stopped.");

    // 停止錄音
    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
    }

    //console.log("MediaRecorder stopped.");

    // 等待錄音完全停止
    await new Promise((resolve, reject) => {
        mediaRecorder.addEventListener('stop', resolve, { once: true });
        mediaRecorder.addEventListener('error', (error) => {
            console.error('MediaRecorder error:', error);
            reject(error);
        }, { once: true });
    });

    //console.log("Promise resolved.");

    try {
        // 保存音頻
        const blob = new Blob(chunks, { type: 'audio/webm' });
    
        // 修改後的部分：判斷音頻數據是否為空，若不為空則進行保存
        if (blob.size > 0) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `recording-${Date.now()}.webm`;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                document.body.removeChild(a);
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
        mediaRecorder.pause();
        gainNode.gain.value = 0;
        updateUIWhilePaused();
    } else if (mediaRecorder && mediaRecorder.state === "paused") {
        mediaRecorder.resume();
        gainNode.gain.value = 1;
        updateUIWhileRecording();
    } else {
        console.error("MediaRecorder 狀態不正確: ", mediaRecorder.state);
    }
}

function resumeRecording() {
    console.log('MediaRecorder isRecording:', mediaRecorder.isRecording());
    //console.log('Resuming recording')
    if (mediaRecorder && mediaRecorder.state === "paused") {
        mediaRecorder.resume();
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const startBtn = document.getElementById('startBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    let buffer;

    if (startBtn) {
        startBtn.addEventListener('click', () => {
            //console.log('Start button clicked');
            if (!mediaRecorder || (mediaRecorder && !mediaRecorder.isRecording())) {
                startRecording();
                pauseBtn.disabled = false;
                stopBtn.disabled = false;
                startBtn.disabled = true;
            }
        });        
    }
     else {
        console.error('Cannot find element with id "startBtn"');
    }

    if (pauseBtn) {
        pauseBtn.addEventListener('click', () => {
            //console.log('Pause button clicked');
            pauseRecording();
        });
        
    } else {
        console.error('Cannot find element with id "pauseBtn"');
    }

    const stopBtn = document.getElementById('stopBtn');
    
    if (stopBtn) {
        stopBtn.addEventListener('click', () => {
            //console.log('Stop button clicked');
            stopRecording();
        });
    } else {
        console.error('Cannot find element with id "stopBtn"');
    }    

});

async function sliceAudio(blob, volumeThreshold, minSilenceDuration) {
    const audioBuffer = await new Promise((resolve, reject) => {
        const response = new Response(blob, { type: 'audio/wav' });
        response.arrayBuffer().then((data) => {
            audioContext.decodeAudioData(data, (decodedData) => {
                resolve(decodedData);
            }, (error) => {
                console.error('Error decoding audio data:', error);
                reject(null);
            });
        });
    });

    if (!audioBuffer) {
        return [];
    }
    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    const minSilenceSamples = Math.floor(minSilenceDuration * sampleRate);
    const volumeThresholdValue = volumeThreshold / 100;

    let startSample = 0;
    let endSample = 0;
    let silenceDuration = 0;
    let isSilent = false;

    const slicedAudioBuffers = [];

    for (let i = 0; i < channelData.length; i++) {
        const sample = channelData[i];
        const isSampleSilent = Math.abs(sample) < volumeThresholdValue;

        if (!isSilent && isSampleSilent) {
            silenceDuration = 1;
            isSilent = true;
        } else if (isSilent && isSampleSilent) {
            silenceDuration++;
        } else if (isSilent && !isSampleSilent) {
            if (silenceDuration >= minSilenceSamples) {
                endSample = Math.max(startSample, i - silenceDuration);
                if (endSample - startSample > 0) {
                    const sliceBuffer = audioContext.createBuffer(1, endSample - startSample, sampleRate);
                    sliceBuffer.copyToChannel(channelData.subarray(startSample, endSample), 0);
                    slicedAudioBuffers.push(sliceBuffer);
                    startSample = i;
                }
            }
            isSilent = false;
        }
    }

    if (startSample < channelData.length && channelData.length - startSample >= sampleRate) { // 修改這一行
        const sliceBuffer = audioContext.createBuffer(1, channelData.length - startSample, sampleRate);
        sliceBuffer.copyToChannel(channelData.subarray(startSample, channelData.length), 0);
        slicedAudioBuffers.push(sliceBuffer);
    }

    return slicedAudioBuffers;
}

function downloadBlob(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }, 100);
}

async function bufferToBlob(audioBuffer) {
    const bufferSource = audioContext.createBufferSource();
    bufferSource.buffer = audioBuffer;

    // 使用 MediaStreamAudioDestinationNode
    const mediaStreamDestination = audioContext.createMediaStreamDestination();
    bufferSource.connect(mediaStreamDestination);

    // 使用 MediaStreamAudioDestinationNode 的 stream 作為 MediaRecorder 的參數
    const recorder = new MediaRecorder(mediaStreamDestination.stream);
    const chunks = [];

    recorder.ondataavailable = (event) => {
        chunks.push(event.data);
    };

    recorder.start();
    bufferSource.start();

    await new Promise((resolve) => {
        recorder.onstop = resolve;
        recorder.addEventListener('error', (event) => {
            console.error('MediaRecorder error:', event.error);
        }, { once: true });
    });

    const blob = new Blob(chunks, { type: 'audio/wav' });
    return blob;
}

// 函數 - 將 AudioBuffer 轉換為 Blob
async function convertAudioBufferToBlob(audioBuffer) {
    return await bufferToBlob(audioBuffer);
}

// 函數 - 將 Blob 轉換為 AudioBuffer
async function convertBlobToAudioBuffer(blob) {
    const arrayBuffer = await new Response(blob).arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    return audioBuffer;
}

// 函數1：將WAV格式音訊轉換為浮點數數組
async function wavToFloat32Array(blob) {
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const float32Array = audioBuffer.getChannelData(0);
    //console.log('將WAV格式音訊轉換為浮點數數組');
    return float32Array;
}

// 函數9：將浮點數數組轉換回適合傳輸的格式（Blob）
async function float32ArrayToWavBlob(float32Array) {
    const audioBuffer = audioContext.createBuffer(1, float32Array.length, audioContext.sampleRate);
    audioBuffer.copyToChannel(float32Array, 0);
    const wavBlob = await bufferToBlob(audioBuffer);
    //console.log('將浮點數數組轉換回適合傳輸的格式');
    return wavBlob;
}

//音訊降噪
async function denoiseAudio(float32Array) {
    const noiseReduction = 0.95;
    let lastValue = 0;

    for (let i = 0; i < float32Array.length; i++) {
        const currentValue = float32Array[i];
        float32Array[i] = currentValue + (lastValue - currentValue) * noiseReduction;
        lastValue = float32Array[i];
    }

    console.log("Denoised audio:", float32Array);
    return float32Array;

}

//增強語音信號
async function enhanceSpeech(float32Array) {
    const gain = 1.5;

    for (let i = 0; i < float32Array.length; i++) {
        float32Array[i] *= gain;
    }

    console.log("Enhanced audio:", float32Array);
    return float32Array;

}

//音量正規化
async function normalizeVolume(float32Array) {
    let max = 0;

    for (let i = 0; i < float32Array.length; i++) {
        max = Math.max(max, Math.abs(float32Array[i]));
    }

    const normalizationFactor = 1.0 / max;

    for (let i = 0; i < float32Array.length; i++) {
        float32Array[i] *= normalizationFactor;
    }

    console.log("Normalized audio:", float32Array);
    return float32Array;

}

// 函數5：過濾指定頻率範圍的音訊信號
async function filterFrequencyRange(float32Array, lowFrequency, highFrequency) {
    const offlineContext = new OfflineAudioContext(1, float32Array.length, audioContext.sampleRate);
    const source = offlineContext.createBufferSource();
    const filter = offlineContext.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = (lowFrequency + highFrequency) / 2;
    filter.Q.value = (highFrequency - lowFrequency) / filter.frequency.value;

    const audioBuffer = offlineContext.createBuffer(1, float32Array.length, audioContext.sampleRate);
    audioBuffer.getChannelData(0).set(float32Array);

    source.buffer = audioBuffer;
    source.connect(filter);
    filter.connect(offlineContext.destination);
    source.start(0);

    const renderedBuffer = await offlineContext.startRendering();
    return renderedBuffer.getChannelData(0);
}

// 函數6：語音檢測
function detectSpeech(float32Array, threshold) {
    const isSpeech = new Array(float32Array.length).fill(false);

    for (let i = 0; i < float32Array.length; i++) {
        if (Math.abs(float32Array[i]) > threshold) {
            isSpeech[i] = true;
        }
    }

    return isSpeech;
}
// 函數7：語音分段
function splitSpeech(float32Array, isSpeech, minSilenceDuration, sampleRate) {
    const segments = [];
    let speechStart = -1;

    for (let i = 0; i < float32Array.length; i++) {
        if (isSpeech[i]) {
            if (speechStart === -1) {
                speechStart = i;
            }
        } else if (speechStart !== -1) {
            const silenceDuration = (i - speechStart) / sampleRate;

            if (silenceDuration >= minSilenceDuration) {
                segments.push({
                    start: speechStart,
                    end: i
                });
                speechStart = -1;
            }
        }
    }

    // 檢查是否有未完成的語音片段
    if (speechStart !== -1) {
        segments.push({
            start: speechStart,
            end: float32Array.length
        });
    }

    return segments;
}
