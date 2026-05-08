param(
    [string]$Title = "Claude Code",
    [string]$Body = ""
)

$ErrorActionPreference = "SilentlyContinue"

# Use Windows PowerShell's registered AppUserModelID so toasts reliably render
# on stock Win10/11 without installing BurntToast or registering a shortcut.
$AppId = "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe"

try {
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] | Out-Null
} catch {
    return
}

$titleEscaped = [System.Security.SecurityElement]::Escape($Title)
$bodyEscaped  = [System.Security.SecurityElement]::Escape($Body)

$xml = @"
<toast activationType="protocol" launch="">
  <visual>
    <binding template="ToastGeneric">
      <text>$titleEscaped</text>
      <text>$bodyEscaped</text>
    </binding>
  </visual>
  <audio src="ms-winsoundevent:Notification.Default" />
</toast>
"@

try {
    $doc = New-Object Windows.Data.Xml.Dom.XmlDocument
    $doc.LoadXml($xml)
    $toast = New-Object Windows.UI.Notifications.ToastNotification $doc
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($AppId).Show($toast)
} catch {
    return
}
