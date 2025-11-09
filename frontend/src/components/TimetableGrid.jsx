import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Box from '@mui/material/Box'
import Tooltip from '@mui/material/Tooltip'

const colorPalette = [
  '#5b8cff', '#22d3ee', '#34d399', '#f59e0b', '#ef4444', '#a78bfa', '#f472b6', '#10b981'
]

function colorForKey(key) {
  if (!key) return 'default'
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  return colorPalette[hash % colorPalette.length]
}

export default function TimetableGrid({ title = 'Timetable', data = {}, periodTimes, showDetails = false, onSlotClick, mode }) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const periods = ['1', '2', '3', '4', '5', '6', '7', '8']

  // Collect unique subjects for legend
  const subjects = new Set()
  days.forEach((d) => periods.forEach((p) => {
    const val = data?.[d]?.[p]
    if (val) {
      const label = typeof val === 'string' ? val : val.label
      if (label) subjects.add(label.split(' ')[0])
    }
  }))

  return (
    <Paper sx={{ p: 2 }} elevation={2}>
      <Typography variant="h6" sx={{ mb: 1 }}>{title}</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: '100px repeat(8, 1fr)', gap: 1 }}>
        <Box />
        {periods.map((p, idx) => (
          <Paper key={p} variant="outlined" sx={{ p: 1, textAlign: 'center', fontWeight: 600 }}>
            {`P${p}`}
            {periodTimes?.[idx] && (
              <Typography variant="caption" display="block" color="text.secondary">{periodTimes[idx]}</Typography>
            )}
          </Paper>
        ))}
        {days.map((d) => (
          <Box key={`${d}-row`} sx={{ display: 'contents' }}>
            <Paper variant="outlined" sx={{ p: 1, textAlign: 'center', fontWeight: 600 }}>{d}</Paper>
            {periods.map((p, idx) => {
              const val = data?.[d]?.[p]
              const label = typeof val === 'string' ? val : val?.label
              const subject = label ? label.split(' ')[0] : ''
              const color = colorForKey(subject)
              const handleClick = () => {
                if (onSlotClick) onSlotClick({ day: d, period: p, value: val })
              }
              return (
                <Paper onClick={handleClick} key={`${d}-${p}`} variant="outlined" sx={{ p: 1, minHeight: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', cursor: onSlotClick ? 'pointer' : 'default' }}>
                  {label ? (
                    showDetails && typeof val === 'object' ? (
                      <Tooltip
                        title={
                          val?.faculty ? (
                            <Box sx={{ p: 0.5 }}>
                              <Typography variant="caption"><strong>Faculty:</strong> {val.faculty.name}</Typography><br/>
                              <Typography variant="caption">ID: {val.faculty.id}</Typography><br/>
                              <Typography variant="caption">Phone: {val.faculty.phone}</Typography>
                              {(val.section || val.section_id) ? (<><br/><Typography variant="caption">Section: {val.section || val.section_id}</Typography></>) : null}
                              {val.room ? (<><br/><Typography variant="caption">Room: {val.room}</Typography></>) : null}
                            </Box>
                          ) : label
                        }
                        arrow
                      >
                        <Box sx={{ maxWidth: '100%' }}>
                          <Typography variant="body2" sx={{ color, fontWeight: 600, lineHeight: 1 }}>{label}</Typography>
                          {mode === 'faculty' ? (
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2 }}>
                              {(val.section || val.section_id) ? `${val.section || val.section_id}` : ''}
                              {periodTimes?.[idx] ? ` • ${periodTimes[idx]}` : ` • P${p}`}
                              {val.room ? ` • ${val.room}` : ''}
                            </Typography>
                          ) : (
                            ((val.section || val.section_id) || val.faculty?.name || val.room) && (
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2 }}>
                                {(val.section || val.section_id) ? `${val.section || val.section_id} ` : ''}
                                {val.faculty?.short || val.faculty?.name ? `• ${val.faculty?.short || val.faculty?.name}` : ''}
                                {val.room ? ` • ${val.room}` : ''}
                              </Typography>
                            )
                          )}
                        </Box>
                      </Tooltip>
                    ) : (
                      <Tooltip
                        title={
                          typeof val === 'object' && val?.faculty ? (
                            <Box sx={{ p: 0.5 }}>
                              <Typography variant="caption"><strong>Faculty:</strong> {val.faculty.name}</Typography><br/>
                              <Typography variant="caption">ID: {val.faculty.id}</Typography><br/>
                              <Typography variant="caption">Phone: {val.faculty.phone}</Typography>
                              {(val.section || val.section_id) ? (<><br/><Typography variant="caption">Section: {val.section || val.section_id}</Typography></>) : null}
                              {val.room ? (<><br/><Typography variant="caption">Room: {val.room}</Typography></>) : null}
                            </Box>
                          ) : label
                        }
                        arrow
                      >
                        <Box sx={{ maxWidth: '100%' }}>
                          <Chip label={label} size="small" sx={{ bgcolor: color + '33', color, borderColor: color, maxWidth: '100%' }} variant="outlined" />
                          {mode === 'faculty' && (
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2, mt: 0.5 }}>
                              {(val?.section || val?.section_id) ? `${val.section || val.section_id}` : ''}
                              {periodTimes?.[idx] ? ` • ${periodTimes[idx]}` : ` • P${p}`}
                              {val?.room ? ` • ${val.room}` : ''}
                            </Typography>
                          )}
                        </Box>
                      </Tooltip>
                    )
                  ) : null}
                </Paper>
              )
            })}
          </Box>
        ))}
      </Box>
      {subjects.size > 0 && (
        <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: 'wrap' }}>
          {[...subjects].map((s) => (
            <Chip key={s} label={s} size="small" sx={{ bgcolor: colorForKey(s) + '33', color: colorForKey(s) }} />
          ))}
        </Stack>
      )}
    </Paper>
  )
}
