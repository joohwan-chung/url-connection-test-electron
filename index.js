import XLSX from 'xlsx';
import got from 'got';
import pLimit from 'p-limit';
import { Agent } from 'http';
import { Agent as HttpsAgent } from 'https';

// Keep-alive 에이전트 설정 (더 보수적으로 조정)
const httpAgent = new Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 20, // 동시 요청 수에 맞춰 조정
  maxFreeSockets: 5,
  timeout: 60000,
  freeSocketTimeout: 30000
});

const httpsAgent = new HttpsAgent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 20, // 동시 요청 수에 맞춰 조정
  maxFreeSockets: 5,
  timeout: 60000,
  freeSocketTimeout: 30000
});

// URL 접속 테스트 함수
async function testUrl(url, timeout = 30000) { // 타임아웃을 30초로 증가
  const startTime = Date.now();
  
  console.log(`🔗 테스트 중: ${url}`);
  
  try {
    
    const response = await got(url, {
      timeout: { 
        request: timeout,
        response: timeout,
        lookup: 10000 // DNS 조회 타임아웃
      },
      agent: {
        http: httpAgent,
        https: httpsAgent
      },
      retry: { 
        limit: 1, // 1회 재시도 허용
        methods: ['GET'],
        statusCodes: [408, 413, 429, 500, 502, 503, 504, 521, 522, 524]
      },
      followRedirect: true,
      throwHttpErrors: false,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    const responseTime = Date.now() - startTime;
    return {
      success: true,
      statusCode: response.statusCode,
      responseTime,
      protocol: url.startsWith('https') ? 'HTTPS' : 'HTTP'
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    return {
      success: false,
      error: error.message,
      responseTime,
      protocol: url.startsWith('https') ? 'HTTPS' : 'HTTP'
    };
  }
}

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

// URL 생성 함수
function buildUrl(domain, protocol = 'http') {
  const normalized = normalizeDomain(domain);
  if (!normalized) return null;
  
  // 추가 검증
  if (normalized.length < 3 || !normalized.includes('.')) {
    return null;
  }
  
  return `${protocol}://${normalized}`;
}

// 결과 요약 데이터 생성 함수
function generateSummaryData(results, totalRows) {
  const successful = results.filter(r => r.finalResult.success).length;
  const failed = results.filter(r => !r.finalResult.success).length;
  const httpSuccess = results.filter(r => r.finalResult.success && r.finalResult.protocol === 'HTTP').length;
  const httpsSuccess = results.filter(r => r.finalResult.success && r.finalResult.protocol === 'HTTPS').length;
  
  // 응답 시간 통계
  const responseTimes = results
    .filter(r => r.finalResult.success && r.finalResult.responseTime)
    .map(r => r.finalResult.responseTime);
  
  const avgResponseTime = responseTimes.length > 0 
    ? (responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length).toFixed(0)
    : 0;
  const minResponseTime = responseTimes.length > 0 ? Math.min(...responseTimes) : 0;
  const maxResponseTime = responseTimes.length > 0 ? Math.max(...responseTimes) : 0;
  
  // 상태 코드 통계
  const statusCodes = {};
  results.forEach(result => {
    if (result.finalResult.success && result.finalResult.statusCode) {
      const code = result.finalResult.statusCode;
      statusCodes[code] = (statusCodes[code] || 0) + 1;
    }
  });
  
  // 에러 패턴 통계
  const errorPatterns = {};
  results.forEach(result => {
    if (!result.finalResult.success) {
      const error = result.finalResult.httpError || result.finalResult.httpsError || '';
      const pattern = error.split(':')[0] || 'Unknown Error';
      errorPatterns[pattern] = (errorPatterns[pattern] || 0) + 1;
    }
  });
  
  return [
    ['URL 접속 테스트 결과 요약'],
    [''],
    ['📊 기본 통계'],
    ['총 데이터 수', totalRows],
    ['성공', successful, `${((successful / totalRows) * 100).toFixed(1)}%`],
    ['실패', failed, `${((failed / totalRows) * 100).toFixed(1)}%`],
    [''],
    ['🌐 프로토콜별 성공'],
    ['HTTP 성공', httpSuccess, `${((httpSuccess / totalRows) * 100).toFixed(1)}%`],
    ['HTTPS 성공', httpsSuccess, `${((httpsSuccess / totalRows) * 100).toFixed(1)}%`],
    [''],
    ['⏱️  응답 시간 통계'],
    ['평균 응답 시간', `${avgResponseTime}ms`],
    ['최소 응답 시간', `${minResponseTime}ms`],
    ['최대 응답 시간', `${maxResponseTime}ms`],

    ['📊 상태 코드 분포'],
    ...Object.entries(statusCodes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([code, count]) => [code, count, `${((count / successful) * 100).toFixed(1)}%`]),
    [''],
    ['❌ 주요 에러 패턴'],
    ...Object.entries(errorPatterns)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([pattern, count]) => [pattern, count, `${((count / failed) * 100).toFixed(1)}%`]),
    [''],
    ['🎯 성공한 도메인 샘플 (처음 10개)'],
    ...results
      .filter(r => r.finalResult.success)
      .slice(0, 10)
      .map((result, index) => [
        `${index + 1}. ${result.normalized}`,
        result.finalResult.protocol,
        result.finalResult.statusCode,
        `${result.finalResult.responseTime}ms`
      ]),
    [''],
    ['❌ 실패한 도메인 샘플 (처음 10개)'],
    ...results
      .filter(r => !r.finalResult.success)
      .slice(0, 10)
      .map((result, index) => [
        `${index + 1}. ${result.normalized}`,
        result.finalResult.httpError || 'N/A',
        result.finalResult.httpsError || 'N/A'
      ])
  ];
}

// 메인 함수
async function main() {
  // 도움말 표시
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log('🔍 URL 접속 가능 여부 검사 도구\n');
    console.log('사용법:');
    console.log('  node index.js                                    # 자동 컬럼 감지');
    console.log('  node index.js [컬럼인덱스]                        # 특정 컬럼 사용');
    console.log('  node index.js [컬럼인덱스] [파일명]               # 특정 컬럼과 파일명 사용');
    console.log('  node index.js [컬럼인덱스] [파일명] [검사개수]     # 검사 개수 지정');
    console.log('');
    console.log('예시:');
    console.log('  node index.js                                    # 기본 실행');
    console.log('  node index.js 0                                  # A열 사용');
    console.log('  node index.js 2 my_file.xlsx                     # C열, my_file.xlsx 사용');
    console.log('  node index.js 5 URL_LIST_TEST.xlsx 1000          # F열, 1000개만 검사');
    console.log('');
    console.log('컬럼 인덱스:');
    console.log('  0 = A열, 1 = B열, 2 = C열, ... 5 = F열');
    console.log('');
    console.log('검사 개수:');
    console.log('  숫자로 지정 (예: 100, 1000, 5000)');
    console.log('  지정하지 않으면 전체 검사');
    process.exit(0);
  }
  
  console.log('🔍 URL 접속 가능 여부 검사 시작...\n');
  
  try {
    // 명령행 인수에서 컬럼 인덱스, 파일명, 검사 개수 확인
    console.log('명령행 인수:', process.argv);
    
    let columnIndex = null;
    let fileName = null;
    let maxCount = null;
    
    // 인수 파싱
    for (let i = 2; i < process.argv.length; i++) {
      const arg = process.argv[i];
      
      // 숫자인 경우 (컬럼 인덱스 또는 검사 개수)
      if (!isNaN(arg)) {
        const num = parseInt(arg);
        // 컬럼 인덱스는 0-9 범위, 그 이상은 검사 개수로 처리
        if (num <= 9 && columnIndex === null) {
          columnIndex = num;
        } else {
          maxCount = num;
        }
      } else {
        // 문자열인 경우 파일명
        fileName = arg;
      }
    }
    
    console.log('파싱된 인수:', { columnIndex, fileName, maxCount });
    
    // 파일명이 없으면 오류
    if (!fileName) {
      console.error('❌ 엑셀 파일이 지정되지 않았습니다.');
      console.log('사용법: node index.js [컬럼인덱스] [파일명] [검사개수]');
      process.exit(1);
    }
    
    // 엑셀 파일 읽기
    console.log(`📖 엑셀 파일 읽는 중: ${fileName}`);
    
    // 파일 존재 여부 확인
    const fs = await import('fs');
    const path = await import('path');
    
    if (!fs.existsSync(fileName)) {
      console.error(`❌ 파일을 찾을 수 없습니다: ${fileName}`);
      console.log(`현재 작업 디렉토리: ${process.cwd()}`);
      console.log(`절대 경로: ${path.resolve(fileName)}`);
      process.exit(1);
    }
    
    const workbook = XLSX.readFile(fileName);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    console.log(`✅ 총 ${(data.length - 1).toLocaleString()}개의 행을 발견했습니다.`);
    
    // 도메인 컬럼 찾기
    const headerRow = data[0] || [];
    let domainColumnIndex = 5; // 기본값: F열
    
    // 명령행에서 지정된 컬럼 인덱스가 있으면 사용
    if (columnIndex !== null && columnIndex >= 0 && columnIndex < headerRow.length) {
      domainColumnIndex = columnIndex;
      console.log(`🔧 지정된 컬럼 사용: ${headerRow[columnIndex] || `컬럼 ${columnIndex}`} (${String.fromCharCode(65 + columnIndex)}열)`);
    } else {
      // 헤더에서 도메인 관련 키워드 검색 (정확한 매칭 우선)
      const exactMatches = ['도메인주소'];
      const partialMatches = ['domain', 'url', 'website', '사이트', 'link', '링크'];
      
      // 정확한 매칭 먼저 시도
      for (let i = 0; i < headerRow.length; i++) {
        const header = String(headerRow[i]).toLowerCase();
        if (exactMatches.some(keyword => header === keyword)) {
          domainColumnIndex = i;
          console.log(`🔍 도메인 컬럼 발견 (정확한 매칭): ${headerRow[i]} (${String.fromCharCode(65 + i)}열)`);
          break;
        }
      }
      
      // 정확한 매칭이 없으면 부분 매칭 시도
      if (domainColumnIndex === 5) {
        for (let i = 0; i < headerRow.length; i++) {
          const header = String(headerRow[i]).toLowerCase();
          if (partialMatches.some(keyword => header.includes(keyword))) {
            domainColumnIndex = i;
            console.log(`🔍 도메인 컬럼 발견 (부분 매칭): ${headerRow[i]} (${String.fromCharCode(65 + i)}열)`);
            break;
          }
        }
      }
      
      // 만약 자동 감지가 실패했다면 F열(인덱스 5)을 기본값으로 사용
      if (domainColumnIndex === 5) {
        console.log(`⚠️  자동 감지 실패, 기본값 사용: ${headerRow[5]} (F열)`);
      }
    }
    
    // 도메인 컬럼에서 데이터 추출
    const domains = [];
    for (let i = 1; i < data.length; i++) { // 헤더 제외
      const domain = data[i][domainColumnIndex];
      
      // 데이터 유효성 검사 강화
      if (domain && typeof domain === 'string' && domain.trim().length > 0) {
        const normalized = normalizeDomain(domain);
        
        // 정규화된 도메인이 유효한지 확인
        if (normalized && normalized.length >= 3 && normalized !== 'd' && normalized !== 'D') {
          domains.push({
            original: domain,
            normalized: normalized,
            rowIndex: i
          });
          
          // 검사 개수 제한이 있으면 중단
          if (maxCount && domains.length >= maxCount) {
            break;
          }
        }
      }
    }
    
    if (maxCount) {
      console.log(`✅ ${domains.length.toLocaleString()}개의 유효한 도메인을 발견했습니다. (최대 ${maxCount.toLocaleString()}개로 제한)\n`);
    } else {
      console.log(`✅ ${domains.length.toLocaleString()}개의 유효한 도메인을 발견했습니다.\n`);
    }
    
    // 동시 요청 수 설정 (안정성을 위해 줄임)
    const CONCURRENT_REQUESTS = 100; // 안정성을 위해 100개로 줄임
    const limit = pLimit(CONCURRENT_REQUESTS);
    
    console.log(`⚡ 동시 요청 수: ${CONCURRENT_REQUESTS.toLocaleString()}개`);
    console.log(`🔗 Keep-alive 적용됨`);
    console.log(`⏱️  타임아웃: 30초, 재시도: 1회`);
    console.log(`🌐 User-Agent 설정됨\n`);
    
    // 일렉트론 모드에서는 진행률 바 비활성화
    const isElectron = process.env.NODE_ENV === 'production';
    
    if (isElectron) {
      console.log(`\n🔄 일렉트론 모드 - 진행률 바 비활성화 (총 ${(domains.length * 2).toLocaleString()}개 요청)`);
    } else {
      console.log(`\n🔄 CLI 모드 - 진행률 바 비활성화 (총 ${(domains.length * 2).toLocaleString()}개 요청)`);
    }
    
    const results = [];
    let completedCount = 0;
    let startTime = Date.now();
    
    // 각 도메인에 대해 HTTP/HTTPS 테스트
    console.log(`🚀 URL 테스트 시작 (${domains.length.toLocaleString()}개 도메인)`);
    
    const tasks = domains.map((domain, domainIndex) => {
      return limit(async () => {
        const result = {
          original: domain.original,
          normalized: domain.normalized,
          rowIndex: domain.rowIndex,
          httpResult: null,
          httpsResult: null,
          finalResult: null
        };
        
        // HTTP 테스트 먼저
        const httpUrl = buildUrl(domain.normalized, 'http');
        result.httpResult = await testUrl(httpUrl);
        completedCount++;
        
        // HTTP 성공 시 HTTPS 생략
        if (result.httpResult.success) {
          result.finalResult = {
            success: true,
            protocol: 'HTTP',
            statusCode: result.httpResult.statusCode,
            responseTime: result.httpResult.responseTime,
            url: httpUrl
          };
        } else {
          // HTTP 실패 시 HTTPS 테스트
          const httpsUrl = buildUrl(domain.normalized, 'https');
          result.httpsResult = await testUrl(httpsUrl);
          completedCount++;
          
          if (result.httpsResult.success) {
            result.finalResult = {
              success: true,
              protocol: 'HTTPS',
              statusCode: result.httpsResult.statusCode,
              responseTime: result.httpsResult.responseTime,
              url: httpsUrl
            };
          } else {
            result.finalResult = {
              success: false,
              httpError: result.httpResult.error,
              httpsError: result.httpsResult.error,
              url: domain.normalized
            };
          }
        }
        
        // 일렉트론 모드에서 도메인 결과를 JSON으로 출력
        if (isElectron) {
          try {
            const domainResult = {
              index: domainIndex,
              url: domain.normalized,
              httpStatus: result.httpResult && result.httpResult.success ? 'http-success' : 'http-failed',
              httpsStatus: result.httpsResult && result.httpsResult.success ? 'https-success' : 'https-failed',
              responseTime: result.finalResult && result.finalResult.success ? result.finalResult.responseTime : null,
              finalStatus: result.finalResult && result.finalResult.success ? 'success' : 'failed'
            };
            
            // 줄바꿈 없이 출력하여 JSON 파싱 오류 방지
            process.stdout.write(`DOMAIN_RESULT:${JSON.stringify(domainResult)}\n`);
          } catch (error) {
            console.error('도메인 결과 생성 오류:', error);
          }
        }
        
        // 진행률 업데이트 (속도 계산 포함)
        const elapsed = (Date.now() - startTime) / 1000;
        const speed = elapsed > 0 ? (completedCount / elapsed).toFixed(1) : '0.0';
        
        if (!isElectron) {
          progressBar.update(completedCount, { speed: speed });
        } else {
          // 일렉트론 모드에서는 진행률을 명확한 형식으로 출력
          const totalRequests = domains.length * 2;
          const percentage = ((completedCount / totalRequests) * 100).toFixed(1);
          
          // 더 자주 업데이트하기 위해 매 5개 요청마다 또는 마지막 요청일 때
          if (completedCount % 5 === 0 || completedCount === totalRequests) {
            const progressMessage = `진행률: ${completedCount.toLocaleString()}/${totalRequests.toLocaleString()} (${percentage}%) - 속도: ${speed} req/s`;
            console.log(progressMessage);
          }
        }
        
        results.push(result);
      });
    });
    
    // 모든 작업 완료 대기
    await Promise.all(tasks);
    
    // 진행률 바 정리 (일렉트론 모드에서는 불필요)
    
    console.log('\n✅ 모든 URL 테스트 완료!\n');
    
    // 결과 통계
    const successful = results.filter(r => r.finalResult.success).length;
    const failed = results.filter(r => !r.finalResult.success).length;
    const httpSuccess = results.filter(r => r.finalResult.success && r.finalResult.protocol === 'HTTP').length;
    const httpsSuccess = results.filter(r => r.finalResult.success && r.finalResult.protocol === 'HTTPS').length;
    
    console.log('📊 결과 통계:');
    console.log(`  ✅ 성공: ${successful.toLocaleString()}개`);
    console.log(`  ❌ 실패: ${failed.toLocaleString()}개`);
    console.log(`  🌐 HTTP 성공: ${httpSuccess.toLocaleString()}개`);
    console.log(`  🔒 HTTPS 성공: ${httpsSuccess.toLocaleString()}개`);
    
    // 결과를 원본 데이터에 추가
    const resultData = data.map((row, index) => {
      if (index === 0) {
        // 헤더 행에 결과 컬럼 추가
        return [
          ...row,
          '접속가능여부',
          '프로토콜',
          '상태코드',
          '응답시간(ms)',
          '테스트URL',
          '에러메시지'
        ];
      }
      
      const result = results.find(r => r.rowIndex === index);
      if (result) {
        return [
          ...row,
          result.finalResult.success ? '성공' : '실패',
          result.finalResult.success ? result.finalResult.protocol : '',
          result.finalResult.success ? result.finalResult.statusCode : '',
          result.finalResult.success ? result.finalResult.responseTime : '',
          result.finalResult.success ? result.finalResult.url : '',
          result.finalResult.success ? '' : `${result.finalResult.httpError || ''} / ${result.finalResult.httpsError || ''}`
        ];
      }
      
      return row;
    });
    
    // 결과 요약 정보 생성
    const summaryData = generateSummaryData(results, data.length - 1);
    
    // 결과를 새 워크시트로 저장
    const resultWorkbook = XLSX.utils.book_new();
    const resultWorksheet = XLSX.utils.aoa_to_sheet(resultData);
    const summaryWorksheet = XLSX.utils.aoa_to_sheet(summaryData);
    
    XLSX.utils.book_append_sheet(resultWorkbook, resultWorksheet, 'URL_테스트_결과');
    XLSX.utils.book_append_sheet(resultWorkbook, summaryWorksheet, '결과_요약');
    
    const outputFileName = `URL_TEST_RESULT_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.xlsx`;
    XLSX.writeFile(resultWorkbook, outputFileName);
    
    console.log(`💾 결과가 ${outputFileName} 파일로 저장되었습니다.`);
    
    // 성공한 URL 목록 출력
    console.log('\n🎯 성공한 URL 목록:');
    results.filter(r => r.finalResult.success).forEach(result => {
      console.log(`  ✅ ${result.finalResult.url} (${result.finalResult.protocol}) - ${result.finalResult.statusCode} - ${result.finalResult.responseTime}ms`);
    });
    
    // 실패한 URL 목록 출력 (처음 20개만)
    if (failed > 0) {
      console.log(`\n❌ 실패한 URL 목록 (처음 20개만 표시, 총 ${failed.toLocaleString()}개):`);
      results.filter(r => !r.finalResult.success).slice(0, 20).forEach(result => {
        console.log(`  ❌ ${result.normalized} - HTTP: ${result.httpResult?.error || 'N/A'}, HTTPS: ${result.httpsResult?.error || 'N/A'}`);
      });
      if (failed > 20) {
        console.log(`  ... 및 ${(failed - 20).toLocaleString()}개의 추가 실패 URL`);
      }
    }
    
  } catch (error) {
    console.error('❌ 오류 발생:', error.message);
    process.exit(1);
  }
}

// 스크립트 실행
main().catch(console.error); 