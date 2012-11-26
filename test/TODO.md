test large files with lots of '\r'
partial boundary tests (i.e. '\r\n--webkitBound\r\n--webkitB')
go through byte test several hundred times with distance between '\r' starting at 1 (i.e. '\rX\r') and increasing past 2x boundary size
completely random data (with advanced logging)
