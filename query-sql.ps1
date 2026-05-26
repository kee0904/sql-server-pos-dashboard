param(
  [Parameter(Mandatory = $true)][string]$ServerInstance,
  [Parameter(Mandatory = $true)][string]$Database,
  [string]$Username = "",
  [string]$Password = "",
  [Parameter(Mandatory = $true)][string]$QueryBase64
)

$query = [System.Text.Encoding]::Unicode.GetString([System.Convert]::FromBase64String($QueryBase64))

$builder = New-Object System.Data.SqlClient.SqlConnectionStringBuilder
$builder["Data Source"] = $ServerInstance
$builder["Initial Catalog"] = $Database
$builder["TrustServerCertificate"] = $true
$builder["Application Name"] = "Codex Dashboard Preview"

if ([string]::IsNullOrWhiteSpace($Username)) {
  $builder["Integrated Security"] = $true
} else {
  $builder["User ID"] = $Username
  $builder["Password"] = $Password
}

$connection = New-Object System.Data.SqlClient.SqlConnection $builder.ConnectionString
$command = $connection.CreateCommand()
$command.CommandText = $query
$command.CommandTimeout = 30

$rows = New-Object System.Collections.Generic.List[object]
$columns = New-Object System.Collections.Generic.List[string]

try {
  $connection.Open()
  $reader = $command.ExecuteReader()

  for ($index = 0; $index -lt $reader.FieldCount; $index++) {
    $columns.Add($reader.GetName($index))
  }

  while ($reader.Read()) {
    $row = [ordered]@{}
    foreach ($column in $columns) {
      $value = $reader[$column]
      if ($value -is [System.DBNull]) {
        $row[$column] = $null
      } elseif ($value -is [System.DateTime]) {
        $row[$column] = $value.ToString("yyyy-MM-dd HH:mm:ss.fff")
      } else {
        $row[$column] = $value
      }
    }
    $rows.Add([pscustomobject]$row)
  }

  [pscustomobject]@{
    columns = @($columns.ToArray())
    rows = @($rows.ToArray())
  } | ConvertTo-Json -Depth 8 -Compress
} finally {
  if ($reader) {
    $reader.Close()
  }
  $connection.Close()
}
