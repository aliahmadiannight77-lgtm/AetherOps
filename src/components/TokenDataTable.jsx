import { useMemo } from 'react'
import { LockKeyhole, Trash2 } from 'lucide-react'
import {
  TableBody, TableCell, TableHead, TableHeader, TableHeaderGroup,
  TableProvider, TableRow,
} from '@/components/kibo-ui/table'

export default function TokenDataTable({ tokens, onRevoke }) {
  const columns = useMemo(() => [
    {
      accessorKey: 'name', header: 'نام توکن',
      cell: ({ row }) => <span className="token-name"><span className="key-icon"><LockKeyhole size={15}/></span><b>{row.original.name}</b></span>,
    },
    { accessorKey: 'prefix', header: 'کلید', cell: ({ row }) => <code>{row.original.prefix}</code> },
    { accessorKey: 'created', header: 'ساخته‌شده', cell: ({ row }) => <span className="token-date">{row.original.created}</span> },
    { id: 'status', header: 'وضعیت', cell: () => <span className="live-tag"><i/> فعال</span> },
    {
      id: 'actions', header: '',
      cell: ({ row }) => <button className="icon-button token-revoke" aria-label={`لغو ${row.original.name}`} onClick={() => onRevoke(row.original.id)}><Trash2 size={15}/></button>,
    },
  ], [onRevoke])

  return <div className="token-table kibo-token-table">
    <TableProvider columns={columns} data={tokens} className="w-full text-sm">
      <TableHeader className="kibo-table-head">
        {({ headerGroup }) => <TableHeaderGroup headerGroup={headerGroup}>
          {({ header }) => <TableHead header={header} className="kibo-table-th"/>}
        </TableHeaderGroup>}
      </TableHeader>
      <TableBody className="kibo-table-body">
        {({ row }) => <TableRow row={row} className="kibo-table-tr">
          {({ cell }) => <TableCell cell={cell} className="kibo-table-td"/>}
        </TableRow>}
      </TableBody>
    </TableProvider>
  </div>
}
