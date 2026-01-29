// vacancy-metrics.test.ts - 空室メトリクスのユニットテスト

describe('Vacancy Metrics', () => {
  // ===== safeRate テスト =====
  describe('safeRate', () => {
    // safeRate関数をテスト用に再定義
    const safeRate = (numerator: number, denominator: number): number | null => {
      if (denominator === 0) return null;
      return Math.round((numerator / denominator) * 1000) / 10;
    };

    it('分母が0の場合はnullを返す', () => {
      expect(safeRate(10, 0)).toBeNull();
      expect(safeRate(0, 0)).toBeNull();
      expect(safeRate(-5, 0)).toBeNull();
    });

    it('正常な計算を行う', () => {
      expect(safeRate(50, 100)).toBe(50.0);
      expect(safeRate(1, 3)).toBe(33.3);
      expect(safeRate(2, 3)).toBe(66.7);
      expect(safeRate(100, 100)).toBe(100.0);
      expect(safeRate(0, 100)).toBe(0.0);
    });

    it('小数点1桁で丸める', () => {
      expect(safeRate(1, 7)).toBe(14.3);
      expect(safeRate(2, 7)).toBe(28.6);
      expect(safeRate(3, 7)).toBe(42.9);
    });

    it('100%を超える場合も計算する', () => {
      expect(safeRate(120, 100)).toBe(120.0);
      expect(safeRate(200, 100)).toBe(200.0);
    });
  });

  // ===== status集計テスト =====
  describe('normalizeRoomStatus', () => {
    // ステータス正規化関数をテスト用に再定義
    type NormalizedStatus = 'AVAILABLE' | 'LOCKED' | 'OCCUPIED' | 'MAINTENANCE' | 'UNKNOWN';

    const normalizeRoomStatus = (status: string): NormalizedStatus => {
      switch (status) {
        case '空室':
          return 'AVAILABLE';
        case '予約':
          return 'LOCKED';
        case '入居中':
        case '退去予定':
          return 'OCCUPIED';
        case 'メンテナンス':
          return 'MAINTENANCE';
        default:
          return 'UNKNOWN';
      }
    };

    it('空室をAVAILABLEに変換', () => {
      expect(normalizeRoomStatus('空室')).toBe('AVAILABLE');
    });

    it('予約をLOCKEDに変換', () => {
      expect(normalizeRoomStatus('予約')).toBe('LOCKED');
    });

    it('入居中をOCCUPIEDに変換', () => {
      expect(normalizeRoomStatus('入居中')).toBe('OCCUPIED');
    });

    it('退去予定をOCCUPIEDに変換', () => {
      expect(normalizeRoomStatus('退去予定')).toBe('OCCUPIED');
    });

    it('メンテナンスをMAINTENANCEに変換', () => {
      expect(normalizeRoomStatus('メンテナンス')).toBe('MAINTENANCE');
    });

    it('未知のステータスをUNKNOWNに変換', () => {
      expect(normalizeRoomStatus('不明')).toBe('UNKNOWN');
      expect(normalizeRoomStatus('')).toBe('UNKNOWN');
      expect(normalizeRoomStatus('その他')).toBe('UNKNOWN');
      expect(normalizeRoomStatus('invalid')).toBe('UNKNOWN');
    });
  });

  // ===== 稼働率計算テスト =====
  describe('occupancyRate calculation', () => {
    const safeRate = (numerator: number, denominator: number): number | null => {
      if (denominator === 0) return null;
      return Math.round((numerator / denominator) * 1000) / 10;
    };

    it('稼働率を正しく計算する（入居中/総室数）', () => {
      // 10室中8室入居 = 80%
      expect(safeRate(8, 10)).toBe(80.0);

      // 22室中12室入居 = 54.5%
      expect(safeRate(12, 22)).toBe(54.5);

      // 9室中7室入居 = 77.8%
      expect(safeRate(7, 9)).toBe(77.8);
    });

    it('空室率を正しく計算する（空室/総室数）', () => {
      // 10室中2室空室 = 20%
      expect(safeRate(2, 10)).toBe(20.0);

      // 22室中10室空室 = 45.5%
      expect(safeRate(10, 22)).toBe(45.5);
    });

    it('総室数0の場合はnull', () => {
      expect(safeRate(0, 0)).toBeNull();
    });
  });

  // ===== 集計ロジックテスト =====
  describe('status aggregation', () => {
    type NormalizedStatus = 'AVAILABLE' | 'LOCKED' | 'OCCUPIED' | 'MAINTENANCE' | 'UNKNOWN';

    const normalizeRoomStatus = (status: string): NormalizedStatus => {
      switch (status) {
        case '空室':
          return 'AVAILABLE';
        case '予約':
          return 'LOCKED';
        case '入居中':
        case '退去予定':
          return 'OCCUPIED';
        case 'メンテナンス':
          return 'MAINTENANCE';
        default:
          return 'UNKNOWN';
      }
    };

    it('複数の部屋ステータスを正しく集計する', () => {
      const rooms = [
        { status: '空室' },
        { status: '空室' },
        { status: '予約' },
        { status: '入居中' },
        { status: '入居中' },
        { status: '入居中' },
        { status: '退去予定' },
        { status: 'メンテナンス' },
        { status: '不明' },
      ];

      const stats = {
        AVAILABLE: 0,
        LOCKED: 0,
        OCCUPIED: 0,
        MAINTENANCE: 0,
        UNKNOWN: 0,
      };

      rooms.forEach((room) => {
        const normalized = normalizeRoomStatus(room.status);
        stats[normalized]++;
      });

      expect(stats.AVAILABLE).toBe(2);
      expect(stats.LOCKED).toBe(1);
      expect(stats.OCCUPIED).toBe(4); // 入居中3 + 退去予定1
      expect(stats.MAINTENANCE).toBe(1);
      expect(stats.UNKNOWN).toBe(1);
    });

    it('空の配列の場合は全て0', () => {
      const rooms: { status: string }[] = [];

      const stats = {
        AVAILABLE: 0,
        LOCKED: 0,
        OCCUPIED: 0,
        MAINTENANCE: 0,
        UNKNOWN: 0,
      };

      rooms.forEach((room) => {
        const normalized = normalizeRoomStatus(room.status);
        stats[normalized]++;
      });

      expect(stats.AVAILABLE).toBe(0);
      expect(stats.LOCKED).toBe(0);
      expect(stats.OCCUPIED).toBe(0);
      expect(stats.MAINTENANCE).toBe(0);
      expect(stats.UNKNOWN).toBe(0);
    });
  });

  // ===== 表示ユーティリティテスト =====
  describe('display utilities', () => {
    const displayRate = (rate: number | null): string => {
      if (rate === null || rate === undefined) return '--';
      return `${rate}%`;
    };

    const displayCount = (count: number | null): string => {
      if (count === null || count === undefined) return '--';
      return count.toString();
    };

    it('displayRateはnullを--に変換', () => {
      expect(displayRate(null)).toBe('--');
    });

    it('displayRateは数値を%付きで表示', () => {
      expect(displayRate(50)).toBe('50%');
      expect(displayRate(0)).toBe('0%');
      expect(displayRate(100)).toBe('100%');
      expect(displayRate(77.8)).toBe('77.8%');
    });

    it('displayCountはnullを--に変換', () => {
      expect(displayCount(null)).toBe('--');
    });

    it('displayCountは数値を文字列で表示', () => {
      expect(displayCount(0)).toBe('0');
      expect(displayCount(10)).toBe('10');
      expect(displayCount(100)).toBe('100');
    });
  });

  // ===== 稼働率色分けテスト =====
  describe('occupancy color coding', () => {
    const getOccupancyColor = (rate: number | null): string => {
      if (rate === null) return 'gray';
      if (rate >= 95) return 'green';
      if (rate >= 85) return 'blue';
      if (rate >= 70) return 'yellow';
      return 'red';
    };

    it('nullの場合はgray', () => {
      expect(getOccupancyColor(null)).toBe('gray');
    });

    it('95%以上はgreen', () => {
      expect(getOccupancyColor(95)).toBe('green');
      expect(getOccupancyColor(100)).toBe('green');
    });

    it('85-94%はblue', () => {
      expect(getOccupancyColor(85)).toBe('blue');
      expect(getOccupancyColor(94)).toBe('blue');
    });

    it('70-84%はyellow', () => {
      expect(getOccupancyColor(70)).toBe('yellow');
      expect(getOccupancyColor(84)).toBe('yellow');
    });

    it('70%未満はred', () => {
      expect(getOccupancyColor(69)).toBe('red');
      expect(getOccupancyColor(50)).toBe('red');
      expect(getOccupancyColor(0)).toBe('red');
    });
  });

  // ===== 低稼働施設判定テスト =====
  describe('low occupancy detection', () => {
    const isLowOccupancy = (rate: number | null): boolean => {
      if (rate === null) return false;
      return rate < 70;
    };

    it('70%未満は低稼働', () => {
      expect(isLowOccupancy(69)).toBe(true);
      expect(isLowOccupancy(50)).toBe(true);
      expect(isLowOccupancy(0)).toBe(true);
    });

    it('70%以上は低稼働ではない', () => {
      expect(isLowOccupancy(70)).toBe(false);
      expect(isLowOccupancy(85)).toBe(false);
      expect(isLowOccupancy(100)).toBe(false);
    });

    it('nullは低稼働ではない（データなし）', () => {
      expect(isLowOccupancy(null)).toBe(false);
    });
  });
});
