const { ipcRenderer } = require('electron');

// DOM 요소들
const fileInput = document.getElementById('fileInput');
const selectFileBtn = document.getElementById('selectFileBtn');
const columnIndex = document.getElementById('columnIndex');
const maxCount = document.getElementById('maxCount');
const concurrentRequests = document.getElementById('concurrentRequests');
const timeout = document.getElementById('timeout');
const retryLimit = document.getElementById('retryLimit');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const openResultBtn = document.getElementById('openResultBtn');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const progressPercent = document.getElementById('progressPercent');
const totalRequests = document.getElementById('totalRequests');
const successCount = document.getElementById('successCount');
const failCount = document.getElementById('failCount');
const successRate = document.getElementById('successRate');
const httpSuccessCount = document.getElementById('httpSuccessCount');
const httpsSuccessCount = document.getElementById('httpsSuccessCount');
const avgResponseTime = document.getElementById('avgResponseTime');
const processingSpeed = document.getElementById('processingSpeed');
const statusIndicator = document.getElementById('statusIndicator');
const statusDot = statusIndicator.querySelector('.status-dot');
const statusText = statusIndicator.querySelector('.status-text');

// 그리드 관련 DOM 요소들
const dataTableBody = document.getElementById('dataTableBody');
const totalDomains = document.getElementById('totalDomains');
const filterBtns = document.querySelectorAll('.filter-btn');

// 로딩 모달 관련 DOM 요소들
const loadingModal = document.getElementById('loadingModal');
const loadingMessage = document.getElementById('loadingMessage');
const loadingProgressFill = document.getElementById('loadingProgressFill');
const loadingProgressText = document.getElementById('loadingProgressText');

// 중지 모달 관련 DOM 요소들
const stopModal = document.getElementById('stopModal');
const stopMessage = document.getElementById('stopMessage');
const stopProgressFill = document.getElementById('stopProgressFill');
const stopProgressText = document.getElementById('stopProgressText');

// 환영 모달 관련 DOM 요소들
const welcomeModal = document.getElementById('welcomeModal');
const welcomeStartBtn = document.getElementById('welcomeStartBtn');
const welcomeSkipBtn = document.getElementById('welcomeSkipBtn');

// 상태 변수들
let isRunning = false;
let startTime = null;
let requestCount = 0;
let successCountValue = 0;
let failCountValue = 0;
let httpSuccessCountValue = 0;
let httpsSuccessCountValue = 0;
let responseTimes = [];

// 도메인 데이터 저장
let domainData = [];
let currentFilter = 'all';

// 환영 모달 제어 함수들
function showWelcomeModal() {
  welcomeModal.classList.add('show');
  document.body.style.overflow = 'hidden';
}

function hideWelcomeModal() {
  welcomeModal.classList.remove('show');
  document.body.style.overflow = '';
  
  // 환영 모달을 한 번 보여줬다는 것을 localStorage에 저장
  localStorage.setItem('welcomeShown', 'true');
}

// 환영 모달 이벤트 리스너
welcomeStartBtn.addEventListener('click', () => {
  hideWelcomeModal();
  showMessage('환영합니다! URL Connection Test를 시작하세요.', 'success');
});

welcomeSkipBtn.addEventListener('click', () => {
  hideWelcomeModal();
});

// 환영 모달 외부 클릭 시 닫기
welcomeModal.addEventListener('click', (event) => {
  if (event.target === welcomeModal) {
    hideWelcomeModal();
  }
});

// 개발자 도구에서 환영 모달을 다시 보여주는 함수 (테스트용)
window.showWelcomeModalAgain = () => {
  localStorage.removeItem('welcomeShown');
  showWelcomeModal();
};

// 로딩 모달 제어 함수들
function showLoadingModal(message = '파일을 분석하고 도메인을 추출하고 있습니다.') {
  loadingMessage.textContent = message;
  loadingProgressFill.style.width = '0%';
  loadingProgressText.textContent = '0%';
  loadingModal.classList.add('show');
}

function hideLoadingModal() {
  loadingModal.classList.remove('show');
}

function updateLoadingProgress(percentage, message = null) {
  loadingProgressFill.style.width = `${percentage}%`;
  loadingProgressText.textContent = `${percentage}%`;
  if (message) {
    loadingMessage.textContent = message;
  }
}

// 중지 모달 제어 함수들
function showStopModal(message = '실행 중인 테스트를 안전하게 중지하고 있습니다.') {
  stopMessage.textContent = message;
  stopProgressFill.style.width = '0%';
  stopProgressText.textContent = '중지 중...';
  stopModal.classList.add('show');
}

function hideStopModal() {
  stopModal.classList.remove('show');
}

function updateStopProgress(percentage, message = null) {
  stopProgressFill.style.width = `${percentage}%`;
  stopProgressText.textContent = `${percentage}%`;
  if (message) {
    stopMessage.textContent = message;
  }
}

// 통계 업데이트 함수
function updateStats() {
  totalRequests.textContent = requestCount.toLocaleString();
  successCount.textContent = successCountValue.toLocaleString();
  failCount.textContent = failCountValue.toLocaleString();
  httpSuccessCount.textContent = httpSuccessCountValue.toLocaleString();
  httpsSuccessCount.textContent = httpsSuccessCountValue.toLocaleString();
  
  const rate = requestCount > 0 ? ((successCountValue / requestCount) * 100).toFixed(1) : 0;
  successRate.textContent = `${rate}%`;
  
  const avgTime = responseTimes.length > 0
    ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
    : 0;
  avgResponseTime.textContent = `${avgTime.toLocaleString()}ms`;
  
  if (startTime) {
    const elapsed = (Date.now() - startTime) / 1000;
    const speed = elapsed > 0 ? (requestCount / elapsed).toFixed(1) : 0;
    processingSpeed.textContent = `${speed} req/s`;
  }
}

// 진행상황 및 통계 초기화 함수
function resetProgressAndStats() {
  // 진행률 초기화
  updateProgress(0, 0);
  
  // 통계 초기화
  requestCount = 0;
  successCountValue = 0;
  failCountValue = 0;
  httpSuccessCountValue = 0;
  httpsSuccessCountValue = 0;
  responseTimes = [];
  startTime = null;
  
  // 통계 업데이트
  updateStats();
  
  console.log('진행상황 및 통계가 초기화되었습니다.');
}

// 메시지 표시 함수
function showMessage(message, type = 'info') {
  // 기존 메시지 제거
  const existingMessage = document.querySelector('.message-toast');
  if (existingMessage) {
    existingMessage.remove();
  }
  
  // 새 메시지 생성
  const messageElement = document.createElement('div');
  messageElement.className = `message-toast message-${type}`;
  messageElement.textContent = message;
  
  // DOM에 추가
  document.body.appendChild(messageElement);
  
  // 애니메이션 효과
  setTimeout(() => {
    messageElement.classList.add('show');
  }, 100);
  
  // 3초 후 자동 제거
  setTimeout(() => {
    messageElement.classList.add('hide');
    setTimeout(() => {
      if (messageElement.parentNode) {
        messageElement.remove();
      }
    }, 300);
  }, 3000);
}

// 진행률 업데이트 함수
function updateProgress(current, total) {
  console.log(`Updating progress: ${current}/${total}`);
  
  const percentage = total > 0 ? (current / total) * 100 : 0;
  
  // DOM 요소 존재 확인
  if (progressFill && progressPercent && progressText) {
    // 부드러운 애니메이션으로 진행률 업데이트
    progressFill.style.width = `${percentage}%`;
    progressPercent.textContent = `${percentage.toFixed(1)}%`;
    
    // 진행률 텍스트 개선
    if (total > 0) {
      progressText.textContent = `${current.toLocaleString()}/${total.toLocaleString()}`;
    } else {
      progressText.textContent = '대기 중...';
    }
    
    // 진행률에 따른 색상 변경
    if (percentage >= 100) {
      progressFill.style.background = 'linear-gradient(90deg, #38a169 0%, #2f855a 50%, #276749 100%)';
    } else if (percentage >= 50) {
      progressFill.style.background = 'linear-gradient(90deg, #007acc 0%, #005a9e 50%, #38a169 100%)';
    } else {
      progressFill.style.background = 'linear-gradient(90deg, #007acc 0%, #005a9e 50%, #38a169 100%)';
    }
    
    console.log(`Progress updated: ${percentage.toFixed(1)}%`);
  } else {
    console.error('Progress elements not found:', { progressFill, progressPercent, progressText });
  }
}

// 엑셀 데이터 로드 및 그리드 표시
async function loadExcelData(fileName) {
  try {
    showLoadingModal('엑셀 파일을 읽는 중...');
    updateLoadingProgress(10, '파일을 분석하고 있습니다...');
    
    // 약간의 지연을 주어 진행률을 시각적으로 표시
    await new Promise(resolve => setTimeout(resolve, 300));
    updateLoadingProgress(30, '도메인 컬럼을 감지하고 있습니다...');
    
    await new Promise(resolve => setTimeout(resolve, 300));
    updateLoadingProgress(50, '도메인 데이터를 추출하고 있습니다...');
    
    const result = await ipcRenderer.invoke('load-excel-data', { fileName });
    
    await new Promise(resolve => setTimeout(resolve, 300));
    updateLoadingProgress(80, '그리드를 업데이트하고 있습니다...');
    
    if (result.success) {
      domainData = result.data;
      totalDomains.textContent = domainData.length.toLocaleString();
      renderGrid();
      
      await new Promise(resolve => setTimeout(resolve, 200));
      updateLoadingProgress(100, '완료되었습니다!');
      
      setTimeout(() => {
        hideLoadingModal();
        showMessage(`엑셀 파일에서 ${domainData.length.toLocaleString()}개의 도메인을 로드했습니다.`, 'success');
      }, 500);
    } else {
      hideLoadingModal();
      showMessage(`엑셀 파일 로드 실패: ${result.error}`, 'error');
    }
  } catch (error) {
    hideLoadingModal();
    console.error('엑셀 데이터 로드 오류:', error);
    showMessage(`엑셀 데이터 로드 오류: ${error.message}`, 'error');
  }
}

// 그리드 렌더링
function renderGrid() {
  if (domainData.length === 0) {
    dataTableBody.innerHTML = '<tr class="empty-row"><td colspan="6">엑셀 파일을 선택하고 테스트를 시작하세요</td></tr>';
    return;
  }

  try {
    const filteredData = filterData(domainData, currentFilter);
    
    // 대량의 데이터 처리 시 성능 최적화
    const fragment = document.createDocumentFragment();
    
    filteredData.forEach((domain, index) => {
      const row = document.createElement('tr');
      row.setAttribute('data-index', domain.originalIndex);
      
      // 부분 성공 상태 확인
      const hasPartialSuccess = (domain.httpStatus === 'http-success' || domain.httpsStatus === 'https-success') && 
                              (domain.httpStatus === 'http-failed' || domain.httpsStatus === 'https-failed');
      
      let rowClassName = `domain-row ${domain.status || 'pending'}`;
      if (hasPartialSuccess) {
        rowClassName += ' partial-success';
      }
      
      row.className = rowClassName;
      
      row.innerHTML = `
        <td>${(domain.originalIndex + 1).toLocaleString()}</td>
        <td>${domain.url}</td>
        <td class="http-status ${domain.httpStatus || 'pending'}">${getStatusText(domain.httpStatus)}</td>
        <td class="https-status ${domain.httpsStatus || 'pending'}">${getStatusText(domain.httpsStatus)}</td>
        <td>${domain.responseTime ? domain.responseTime.toLocaleString() + 'ms' : '-'}</td>
        <td class="final-status ${domain.status || 'pending'}">${getStatusText(domain.status)}</td>
      `;
      
      fragment.appendChild(row);
    });
    
    // 기존 내용 제거 후 새 내용 추가
    dataTableBody.innerHTML = '';
    dataTableBody.appendChild(fragment);
    
  } catch (error) {
    console.error('그리드 렌더링 오류:', error);
    dataTableBody.innerHTML = '<tr class="empty-row"><td colspan="6">그리드 렌더링 중 오류가 발생했습니다.</td></tr>';
  }
}

// 데이터 필터링
function filterData(data, filter) {
  switch (filter) {
    case 'pending':
      return data.filter(item => !item.status || item.status === 'pending');
    case 'success':
      return data.filter(item => item.status === 'success' || item.status === 'partial-success');
    case 'failed':
      return data.filter(item => item.status === 'failed');
    default:
      return data;
  }
}

// 상태 텍스트 변환
function getStatusText(status) {
  switch (status) {
    case 'pending':
      return '대기 중';
    case 'success':
      return '성공';
    case 'failed':
      return '실패';
    case 'partial-success':
      return '부분 성공';
    case 'http-success':
      return 'HTTP 성공';
    case 'https-success':
      return 'HTTPS 성공';
    case 'http-failed':
      return 'HTTP 실패';
    case 'https-failed':
      return 'HTTPS 실패';
    default:
      return '대기 중';
  }
}

// 도메인 상태 업데이트
function updateDomainStatus(index, status, responseTime = null) {
  try {
    if (index >= 0 && index < domainData.length) {
      domainData[index] = { ...domainData[index], status, responseTime };
      
      // 해당 행 업데이트
      const row = dataTableBody.querySelector(`tr[data-index="${index}"]`);
      if (row) {
        // 부분 성공 상태 확인
        const domain = domainData[index];
        const hasPartialSuccess = (domain.httpStatus === 'http-success' || domain.httpsStatus === 'https-success') && 
                                (domain.httpStatus === 'http-failed' || domain.httpsStatus === 'https-failed');
        
        let rowClassName = `domain-row ${status}`;
        if (hasPartialSuccess) {
          rowClassName += ' partial-success';
        }
        
        row.className = rowClassName;
        const finalStatusCell = row.querySelector('.final-status');
        if (finalStatusCell) {
          finalStatusCell.textContent = getStatusText(status);
          finalStatusCell.className = `final-status ${status}`;
        }
        
        if (responseTime) {
          const responseTimeCell = row.querySelector('td:nth-child(5)');
          if (responseTimeCell) {
            responseTimeCell.textContent = `${responseTime.toLocaleString()}ms`;
          }
        }
      }
    }
  } catch (error) {
    console.error('도메인 상태 업데이트 오류:', error);
  }
}

// HTTP/HTTPS 상태 업데이트
function updateProtocolStatus(index, protocol, status, responseTime = null) {
  try {
    if (index >= 0 && index < domainData.length) {
      const statusKey = `${protocol}Status`;
      domainData[index] = { ...domainData[index], [statusKey]: status };
      
      // 해당 행 업데이트
      const row = dataTableBody.querySelector(`tr[data-index="${index}"]`);
      if (row) {
        const statusCell = row.querySelector(`.${protocol}-status`);
        if (statusCell) {
          statusCell.textContent = getStatusText(status);
          statusCell.className = `${protocol}-status ${status}`;
        }
        
        if (responseTime) {
          const responseTimeCell = row.querySelector('td:nth-child(5)');
          if (responseTimeCell) {
            responseTimeCell.textContent = `${responseTime.toLocaleString()}ms`;
          }
        }
      }
    }
  } catch (error) {
    console.error('프로토콜 상태 업데이트 오류:', error);
  }
}

// 파일 선택 버튼 클릭
selectFileBtn.addEventListener('click', async () => {
  try {
    const filePath = await ipcRenderer.invoke('select-file');
    if (filePath) {
      fileInput.value = filePath;
      await loadExcelData(filePath);
    }
  } catch (error) {
    console.error(`파일 선택 오류: ${error.message}`);
  }
});

// 테스트 시작 버튼 클릭
startBtn.addEventListener('click', async () => {
  if (isRunning) return;

  const fileName = fileInput.value;
  
  // 엑셀 파일 선택 확인
  if (!fileName || fileName.trim() === '') {
    showMessage('엑셀 파일을 먼저 선택해주세요.', 'warning');
    return;
  }

  const columnIdx = columnIndex.value !== '' ? parseInt(columnIndex.value) : null;
  const maxCountValue = maxCount.value ? parseInt(maxCount.value) : null;

  // 도메인 데이터가 없으면 로드
  if (domainData.length === 0) {
    await loadExcelData(fileName);
    
    // 로드 후에도 도메인 데이터가 없으면 중단
    if (domainData.length === 0) {
      showMessage('유효한 도메인 데이터를 찾을 수 없습니다. 엑셀 파일을 확인해주세요.', 'error');
      return;
    }
  }

  isRunning = true;
  startBtn.disabled = true;
  stopBtn.disabled = false;
  
  // 상태 업데이트
  statusDot.className = 'status-dot running';
  statusText.textContent = '실행 중';
  
  // 시작 메시지 표시
  showMessage('테스트가 시작되었습니다.', 'info');

  // 통계 초기화
  startTime = Date.now();
  requestCount = 0;
  successCountValue = 0;
  failCountValue = 0;
  httpSuccessCountValue = 0;
  httpsSuccessCountValue = 0;
  responseTimes = [];
  updateStats();

  try {
    const result = await ipcRenderer.invoke('run-url-test', {
      fileName,
      columnIndex: columnIdx,
      maxCount: maxCountValue
    });

    if (!result.success) {
      console.error(`테스트 중 오류가 발생했습니다: ${result.error}`);
      showMessage(`테스트 중 오류가 발생했습니다: ${result.error}`, 'error');
    }
  } catch (error) {
    console.error(`테스트 실행 오류: ${error.message}`);
    showMessage(`테스트 실행 오류: ${error.message}`, 'error');
  } finally {
    isRunning = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    updateProgress(0, 0);
    
    // 상태 업데이트
    statusDot.className = 'status-dot success';
    statusText.textContent = '완료';
    
    // 완료 메시지 표시
    showMessage('테스트가 완료되었습니다.', 'success');
  }
});

// 테스트 중지 버튼 클릭
stopBtn.addEventListener('click', async () => {
  try {
    // 중지 모달 표시
    showStopModal('실행 중인 테스트를 안전하게 중지하고 있습니다.');
    
    // 진행률 애니메이션 시작
    let progress = 0;
    const progressInterval = setInterval(() => {
      progress += 10;
      if (progress <= 100) {
        updateStopProgress(progress, '테스트 프로세스를 종료하고 있습니다...');
      }
    }, 200);
    
    // 메인 프로세스에 중지 요청
    const result = await ipcRenderer.invoke('stop-url-test');

    // 진행률 애니메이션 완료
    clearInterval(progressInterval);
    updateStopProgress(100, '테스트가 성공적으로 중지되었습니다.');
    
    // 잠시 후 모달 숨김
    setTimeout(() => {
      hideStopModal();
      
      isRunning = false;
      startBtn.disabled = false;
      stopBtn.disabled = true;
      
      // 상태 업데이트
      statusDot.className = 'status-dot';
      statusText.textContent = '대기 중';
      
      // 진행상황 및 통계 초기화
      resetProgressAndStats();
      
      // 도메인 데이터 상태 초기화
      if (domainData.length > 0) {
        domainData = domainData.map(domain => ({
          ...domain,
          status: 'pending',
          httpStatus: 'pending',
          httpsStatus: 'pending',
          responseTime: null
        }));
        
        // 그리드 다시 렌더링
        renderGrid();
      }
      
      // 중지 메시지 표시
      if (result.success) {
        showMessage('테스트가 중지되었습니다. 모든 상태가 초기화되었습니다.', 'info');
      } else {
        showMessage(`테스트 중지 중 오류: ${result.error}`, 'error');
      }
    }, 1000);
    
  } catch (error) {
    hideStopModal();
    console.error('테스트 중지 오류:', error);
    showMessage('테스트 중지 중 오류가 발생했습니다.', 'error');
  }
});

// 결과 폴더 열기 버튼 클릭
openResultBtn.addEventListener('click', async () => {
  try {
    const result = await ipcRenderer.invoke('open-result-folder');
    if (!result.success) {
      console.error(`폴더 열기 오류: ${result.error}`);
    }
  } catch (error) {
    console.error(`❌ 폴더 열기 오류: ${error.message}`);
    showMessage(`폴더 열기 오류: ${error.message}`, 'error');
  }
});

// 필터 버튼 클릭 이벤트
filterBtns.forEach(btn => {
  btn.addEventListener('click', async () => {
    // 활성 버튼 변경
    filterBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    // 필터 적용
    currentFilter = btn.dataset.filter;
    
    // 프로그레스바 표시
    const filterProgressBar = document.getElementById('filterProgressBar');
    filterProgressBar.style.display = 'flex';
    
    // 비동기로 그리드 렌더링 (UI 블로킹 방지)
    setTimeout(() => {
      renderGrid();
      
      // 프로그레스바 숨김
      setTimeout(() => {
        filterProgressBar.style.display = 'none';
      }, 300);
    }, 100);
  });
});

// IPC 이벤트 리스너
ipcRenderer.on('test-progress', (event, message) => {
  console.log('Progress message received:', message);
  
  try {
    // 진행률 파싱 - 더 정확한 정규식 사용 (콤마 제거 후 파싱)
    if (message.includes('진행률')) {
      const match = message.match(/진행률:\s*([\d,]+)\/([\d,]+)\s*\(([\d.]+)%\)/);
      if (match) {
        const current = parseInt(match[1].replace(/,/g, ''));
        const total = parseInt(match[2].replace(/,/g, ''));
        const percentage = parseFloat(match[3]);
        
        console.log(`Parsed progress: ${current.toLocaleString()}/${total.toLocaleString()} (${percentage}%)`);
        updateProgress(current, total);
        
        // 통계도 함께 업데이트
        requestCount = current;
        updateStats();
      } else {
        // 대체 파싱 방법
        const simpleMatch = message.match(/([\d,]+)\/([\d,]+)/);
        if (simpleMatch) {
          const current = parseInt(simpleMatch[1].replace(/,/g, ''));
          const total = parseInt(simpleMatch[2].replace(/,/g, ''));
          console.log(`Simple parsed progress: ${current.toLocaleString()}/${total.toLocaleString()}`);
          updateProgress(current, total);
          
          // 통계도 함께 업데이트
          requestCount = current;
          updateStats();
        } else {
          console.log('No progress pattern found in message:', message);
        }
      }
    }
  } catch (error) {
    console.error('Error parsing progress message:', error, message);
  }
});

// 도메인 검사 결과 업데이트 이벤트
ipcRenderer.on('domain-result', (event, data) => {
  try {
    const { index, url, httpStatus, httpsStatus, responseTime, finalStatus } = data;
    
    console.log('도메인 결과 수신:', data);
    
    // 부분 성공 상태 확인
    let actualFinalStatus = finalStatus;
    if (finalStatus === 'failed' && 
        ((httpStatus === 'http-success' && httpsStatus === 'https-failed') || 
         (httpStatus === 'http-failed' && httpsStatus === 'https-success'))) {
      actualFinalStatus = 'partial-success';
    }
    
    // 도메인 상태 업데이트
    updateDomainStatus(index, actualFinalStatus, responseTime);
    
    // HTTP/HTTPS 상태 업데이트
    if (httpStatus) {
      updateProtocolStatus(index, 'http', httpStatus, responseTime);
    }
    if (httpsStatus) {
      updateProtocolStatus(index, 'https', httpsStatus, responseTime);
    }
    
    // 통계 업데이트
    if (actualFinalStatus === 'success' || actualFinalStatus === 'partial-success') {
      successCountValue++;
    } else if (actualFinalStatus === 'failed') {
      failCountValue++;
    }
    
    if (httpStatus === 'http-success') {
      httpSuccessCountValue++;
    }
    if (httpsStatus === 'https-success') {
      httpsSuccessCountValue++;
    }
    
    if (responseTime) {
      responseTimes.push(responseTime);
    }
    
    updateStats();
  } catch (error) {
    console.error('도메인 결과 처리 오류:', error);
  }
});

ipcRenderer.on('test-error', (event, message) => {
  console.error(message);
  showMessage(`테스트 오류: ${message}`, 'error');
});

// 초기 설정 로드
async function loadInitialConfig() {
  try {
    const config = await ipcRenderer.invoke('read-config');
    concurrentRequests.value = config.concurrentRequests;
    timeout.value = config.timeout;
    retryLimit.value = config.retryLimit;
  } catch (error) {
    console.log('기본 설정을 사용합니다.');
  }
}

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', () => {
  loadInitialConfig();
  
  // 환영 모달 표시 로직
  const welcomeShown = localStorage.getItem('welcomeShown');
  if (!welcomeShown) {
    // 약간의 지연을 주어 페이지가 완전히 로드된 후 환영 모달 표시
    setTimeout(() => {
      showWelcomeModal();
    }, 500);
  }
});

// 키보드 단축키
document.addEventListener('keydown', (event) => {
  // 환영 모달이 표시되어 있을 때 ESC 키로 닫기
  if (event.key === 'Escape' && welcomeModal.classList.contains('show')) {
    hideWelcomeModal();
    return;
  }
  
  if (event.ctrlKey || event.metaKey) {
    switch (event.key) {
      case 's':
        event.preventDefault();
        if (!isRunning) startBtn.click();
        break;
      case 'x':
        event.preventDefault();
        if (isRunning) stopBtn.click();
        break;
      case 'o':
        event.preventDefault();
        openResultBtn.click();
        break;
    }
  }
}); 