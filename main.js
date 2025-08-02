import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';
import XLSX from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    icon: join(__dirname, 'assets', 'icon.png'),
    title: 'URL Connection Test',
    show: false,
    titleBarStyle: 'hiddenInset', // macOS 네이티브 타이틀바
    frame: process.platform === 'darwin' ? false : true, // macOS에서는 프레임리스
    backgroundColor: '#1a1a1a',
    vibrancy: 'under-window', // macOS 블러 효과
    transparent: false
  });

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// 엑셀 파일 읽기
ipcMain.handle('load-excel-data', async (event, options) => {
  try {
    const path = await import('path');
    const fs = await import('fs');
    
    let filePath = options.fileName;
    
    // 상대 경로인 경우 현재 디렉토리 기준으로 절대 경로로 변환
    if (!path.isAbsolute(filePath)) {
      filePath = path.join(__dirname, filePath);
    }
    
    // 파일 존재 여부 확인
    if (!fs.existsSync(filePath)) {
      return { success: false, error: `파일을 찾을 수 없습니다: ${filePath}` };
    }
    
    // 엑셀 파일 읽기
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // JSON으로 변환
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    // 첫 번째 행은 헤더로 간주
    const headerRow = jsonData[0] || [];
    const dataRows = jsonData.slice(1);
    
    // 도메인 컬럼 자동 감지
    let domainColumnIndex = 0; // 기본값: A열
    
    // 헤더에서 도메인 관련 키워드 검색
    const exactMatches = ['도메인주소', 'domain', 'url', 'website', '사이트', 'link', '링크', '주소'];
    const partialMatches = ['domain', 'url', 'website', 'site', 'link', 'address', '도메인', '사이트', '링크', '주소'];
    
    // 정확한 매칭 먼저 시도
    for (let i = 0; i < headerRow.length; i++) {
      const header = String(headerRow[i]).toLowerCase().trim();
      if (exactMatches.some(keyword => header === keyword)) {
        domainColumnIndex = i;
        console.log(`도메인 컬럼 발견 (정확한 매칭): ${headerRow[i]} (${String.fromCharCode(65 + i)}열)`);
        break;
      }
    }
    
    // 정확한 매칭이 없으면 부분 매칭 시도
    if (domainColumnIndex === 0) {
      for (let i = 0; i < headerRow.length; i++) {
        const header = String(headerRow[i]).toLowerCase().trim();
        if (partialMatches.some(keyword => header.includes(keyword))) {
          domainColumnIndex = i;
          console.log(`도메인 컬럼 발견 (부분 매칭): ${headerRow[i]} (${String.fromCharCode(65 + i)}열)`);
          break;
        }
      }
    }
    
    // 만약 자동 감지가 실패했다면 첫 번째 컬럼을 기본값으로 사용
    if (domainColumnIndex === 0) {
      console.log(`자동 감지 실패, 기본값 사용: ${headerRow[0] || '첫 번째 컬럼'} (A열)`);
    }
    
    // 도메인 데이터 추출
    const domains = dataRows
      .filter(row => row && row.length > 0)
      .map((row, index) => {
        // 감지된 컬럼에서 도메인 추출
        let domain = row[domainColumnIndex];
        
        // 도메인이 문자열이 아니면 문자열로 변환
        if (typeof domain !== 'string') {
          domain = String(domain || '');
        }
        
        // 빈 도메인 제외
        if (!domain || domain.trim() === '') {
          return null;
        }
        
        // 도메인 정규화
        const normalized = normalizeDomain(domain.trim());
        if (!normalized) {
          return null;
        }
        
        return {
          originalIndex: index,
          url: normalized,
          status: 'pending',
          httpStatus: 'pending',
          httpsStatus: 'pending',
          responseTime: null
        };
      })
      .filter(domain => domain !== null);
    
    console.log(`엑셀 파일에서 ${domains.length.toLocaleString()}개의 도메인을 로드했습니다.`);
    
    return { success: true, data: domains };
  } catch (error) {
    console.error('엑셀 파일 읽기 오류:', error);
    return { success: false, error: error.message };
  }
});

// 도메인 정규화 함수
function normalizeDomain(domain) {
  if (!domain) return null;
  
  // 문자열이 아닌 경우 문자열로 변환
  let domainStr = String(domain);
  
  // 공백 제거 및 소문자 변환
  let normalized = domainStr.trim().toLowerCase();
  
  // http:// 또는 https:// 제거
  normalized = normalized.replace(/^https?:\/\//, '');
  
  // www. 제거 (선택사항)
  // normalized = normalized.replace(/^www\./, '');
  
  // 최소 길이 확인
  if (normalized.length < 3) {
    return null;
  }
  
  // 도메인 형식 기본 검증 (최소한 점이 하나는 있어야 함)
  if (!normalized.includes('.')) {
    return null;
  }
  
  return normalized;
}

// 파일 선택 다이얼로그
ipcMain.handle('select-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Excel Files', extensions: ['xlsx', 'xls'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

// 결과 파일이 저장된 폴더 열기
ipcMain.handle('open-result-folder', async () => {
  try {
    const fs = await import('fs');
    const path = await import('path');
    
    // 현재 작업 디렉토리에서 결과 파일 찾기
    const currentDir = process.cwd();
    const files = fs.readdirSync(currentDir);
    const resultFiles = files.filter(file => 
      file.startsWith('URL_TEST_RESULT_') && file.endsWith('.xlsx')
    );
    
    if (resultFiles.length > 0) {
      // 가장 최근 결과 파일의 폴더 열기
      const latestFile = resultFiles.sort().pop();
      console.log(`결과 파일 폴더 열기: ${currentDir}`);
      shell.openPath(currentDir);
      return { success: true, message: `결과 파일 폴더를 열었습니다. (${resultFiles.length}개 파일 발견)` };
    } else {
      // 결과 파일이 없을 경우 현재 디렉토리 열기
      console.log(`결과 파일이 없어 현재 작업 폴더를 엽니다: ${currentDir}`);
      shell.openPath(currentDir);
      return { success: true, message: '결과 파일이 없어 현재 작업 폴더를 열었습니다.' };
    }
  } catch (error) {
    console.error('폴더 열기 오류:', error);
    return { success: false, error: error.message };
  }
});

// URL 테스트 실행
ipcMain.handle('run-url-test', async (event, options) => {
  return new Promise(async (resolve, reject) => {
    const args = [];
    
    if (options.columnIndex !== null) {
      args.push(options.columnIndex.toString());
    }
    
    if (options.fileName) {
      try {
        // 파일 경로가 절대 경로인지 확인
        const path = await import('path');
        const fs = await import('fs');
        
        let filePath = options.fileName;
        
        // 상대 경로인 경우 현재 디렉토리 기준으로 절대 경로로 변환
        if (!path.isAbsolute(filePath)) {
          filePath = path.join(__dirname, filePath);
        }
        
        // 파일 존재 여부 확인
        if (!fs.existsSync(filePath)) {
          reject({ success: false, error: `파일을 찾을 수 없습니다: ${filePath}` });
          return;
        }
        
        args.push(filePath);
      } catch (error) {
        reject({ success: false, error: `파일 경로 처리 오류: ${error.message}` });
        return;
      }
    } else {
      reject({ success: false, error: '엑셀 파일이 선택되지 않았습니다.' });
      return;
    }
    
    if (options.maxCount) {
      args.push(options.maxCount.toString());
    }
    
    console.log('실행할 명령:', 'node', ['index.js', ...args]);
    console.log('작업 디렉토리:', __dirname);
    console.log('옵션:', options);
    
    const child = spawn('node', ['index.js', ...args], {
      cwd: __dirname,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'production' }
    });

    let output = '';
    let errorOutput = '';
    let messageBuffer = '';

    child.stdout.on('data', (data) => {
      const message = data.toString();
      output += message;
      console.log('STDOUT:', message);
      
      // 진행률 메시지 전송
      mainWindow.webContents.send('test-progress', message);
      
      // 메시지 버퍼에 추가
      messageBuffer += message;
      
      // 도메인 검사 결과 파싱 및 전송
      try {
        // 완전한 줄들만 처리
        const lines = messageBuffer.split('\n');
        
        // 마지막 줄이 완전하지 않으면 버퍼에 남겨둠
        if (!messageBuffer.endsWith('\n')) {
          messageBuffer = lines.pop() || '';
        } else {
          messageBuffer = '';
        }
        
        // 완전한 줄들만 처리
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine.startsWith('DOMAIN_RESULT:')) {
            // DOMAIN_RESULT: 이후의 모든 내용을 추출
            const jsonPart = trimmedLine.substring('DOMAIN_RESULT:'.length).trim();
            
            // JSON 파싱 시도
            const result = JSON.parse(jsonPart);
            console.log('도메인 결과 파싱 성공:', result);
            mainWindow.webContents.send('domain-result', result);
          }
        }
      } catch (error) {
        // JSON 파싱 실패 시 무시 (로그 레벨 낮춤)
        console.debug('JSON 파싱 실패:', error.message, '원본 메시지:', message);
      }
    });
    
    child.stderr.on('data', (data) => {
      const message = data.toString();
      errorOutput += message;
      console.log('STDERR:', message);
      mainWindow.webContents.send('test-error', message);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, output });
      } else {
        reject({ success: false, error: errorOutput, code });
      }
    });

    child.on('error', (error) => {
      reject({ success: false, error: error.message });
    });

    // 프로세스 참조를 저장하여 중지 시 사용
    global.currentTestProcess = child;
  });
});

// 테스트 중지 처리
ipcMain.handle('stop-url-test', async () => {
  try {
    if (global.currentTestProcess) {
      console.log('테스트 프로세스 중지 중...');
      
      // 프로세스와 모든 자식 프로세스 종료
      global.currentTestProcess.kill('SIGTERM');
      
      // 3초 후에도 종료되지 않으면 강제 종료
      setTimeout(() => {
        if (global.currentTestProcess && !global.currentTestProcess.killed) {
          console.log('강제 종료 실행...');
          global.currentTestProcess.kill('SIGKILL');
        }
      }, 3000);
      
      global.currentTestProcess = null;
      return { success: true, message: '테스트가 중지되었습니다.' };
    } else {
      return { success: false, error: '실행 중인 테스트가 없습니다.' };
    }
  } catch (error) {
    console.error('테스트 중지 오류:', error);
    return { success: false, error: error.message };
  }
});

// 설정 파일 읽기
ipcMain.handle('read-config', async () => {
  try {
    const fs = await import('fs');
    const configPath = join(__dirname, 'config.json');

    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(configData);
    }

    return {
      concurrentRequests: 100,
      timeout: 30000,
      retryLimit: 1
    };
  } catch (error) {
    return {
      concurrentRequests: 100,
      timeout: 30000,
      retryLimit: 1
    };
  }
});

// 설정 파일 저장
ipcMain.handle('save-config', async (event, config) => {
  try {
    const fs = await import('fs');
    const configPath = join(__dirname, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 타이틀바 버튼 기능
ipcMain.handle('minimize', () => {
  mainWindow?.minimize();
});

ipcMain.handle('maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.handle('close', () => {
  mainWindow?.close();
}); 