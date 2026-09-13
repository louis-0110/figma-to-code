export default {
  table: {
    columns: [
      { key: 'name', label: '名称', width: 180, ellipsis: true },
      { key: 'status', label: '状态', width: 120 },
      { key: 'time', label: '时间' }
    ],
    rows: [
      { id: 'row-1', name: '正常运行记录', status: '正常', time: '08:00' },
      { id: 'row-2', name: '巡检完成后的一条很长名称记录', status: '巡检', time: '10:30' },
      { id: 'row-3', name: '告警', status: '待处理', time: '13:45' }
    ]
  },
  chart: {
    labels: ['周一', '周二', '周三', '周四', '周五'],
    values: [12, 19, 8, 24, 17]
  }
};
