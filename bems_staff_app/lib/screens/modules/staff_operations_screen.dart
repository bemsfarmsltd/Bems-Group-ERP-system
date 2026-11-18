import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../models/staff_models.dart';
import '../../services/staff_api_service.dart';

class StaffOperationsScreen extends StatefulWidget {
  final StaffUser user;

  const StaffOperationsScreen({super.key, required this.user});

  @override
  State<StaffOperationsScreen> createState() => _StaffOperationsScreenState();
}

class _StaffOperationsScreenState extends State<StaffOperationsScreen> {
  static const _offlineQueueKey = 'bems_ops_offline_drafts';

  bool _loading = true;
  String? _error;
  List<dynamic> _workOrders = [];
  List<dynamic> _dispatches = [];
  List<dynamic> _sites = [];
  List<dynamic> _services = [];
  List<dynamic> _assets = [];
  List<dynamic> _handovers = [];
  List<dynamic> _incidents = [];
  List<Map<String, dynamic>> _offlineDrafts = [];

  @override
  void initState() {
    super.initState();
    _loadOfflineQueue();
    _loadInbox();
  }

  Future<void> _loadOfflineQueue() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_offlineQueueKey);
    if (raw != null && raw.isNotEmpty) {
      try {
        final decoded = jsonDecode(raw);
        if (decoded is List && mounted) {
          setState(() {
            _offlineDrafts = decoded.map((e) => Map<String, dynamic>.from(e as Map)).toList();
          });
        }
      } catch (_) {}
    }
  }

  Future<void> _saveOfflineQueue(List<Map<String, dynamic>> drafts) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_offlineQueueKey, jsonEncode(drafts));
    if (mounted) setState(() => _offlineDrafts = drafts);
  }

  Future<void> _syncOfflineDrafts() async {
    if (_offlineDrafts.isEmpty) return;
    try {
      await StaffApiService.syncOperationsDrafts(
        employeeId: widget.user.id,
        drafts: _offlineDrafts,
        token: widget.user.token,
      );
      await _saveOfflineQueue([]);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Offline operations drafts synchronized.')),
      );
      await _loadInbox();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Sync failed: ${e.toString().replaceFirst('Exception: ', '')}')),
      );
    }
  }

  Future<void> _loadInbox() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await StaffApiService.fetchOperationsInbox(
        employeeId: widget.user.id,
        token: widget.user.token,
      );
      if (!mounted) return;
      setState(() {
        _workOrders = (data['workOrders'] as List?) ?? [];
        _dispatches = (data['dispatches'] as List?) ?? [];
        _sites = (data['sites'] as List?) ?? [];
        _services = (data['services'] as List?) ?? [];
        _assets = (data['assets'] as List?) ?? [];
        _handovers = (data['handovers'] as List?) ?? [];
        _incidents = (data['incidents'] as List?) ?? [];
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _updateStatus(String workOrderId, String nextStatus, {String? reason}) async {
    try {
      await StaffApiService.updateOperationsWorkOrder(
        employeeId: widget.user.id,
        workOrderId: workOrderId,
        status: nextStatus,
        reason: reason,
        token: widget.user.token,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Work order updated to $nextStatus')),
      );
      await _loadInbox();
    } catch (_) {
      final nextQueue = [
        ..._offlineDrafts,
        {
          'clientDraftId': 'draft-${DateTime.now().millisecondsSinceEpoch}',
          'kind': 'WORK_ORDER_STATUS',
          'workOrderId': workOrderId,
          'status': nextStatus,
          if (reason != null) 'reason': reason,
        }
      ];
      await _saveOfflineQueue(nextQueue);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Network offline — saved to Pending Sync queue.')),
      );
    }
  }

  Future<void> _promptBlockReason(String workOrderId) async {
    final controller = TextEditingController();
    final reason = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Report Blocker'),
        content: TextField(
          controller: controller,
          maxLines: 3,
          decoration: const InputDecoration(
            hintText: 'Describe why this work order is blocked...',
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFEA580C), foregroundColor: Colors.white),
            onPressed: () => Navigator.pop(ctx, controller.text.trim()),
            child: const Text('Submit'),
          ),
        ],
      ),
    );
    if (reason != null && reason.isNotEmpty) {
      await _updateStatus(workOrderId, 'BLOCKED', reason: reason);
    }
  }

  Future<void> _openRaiseRequestModal() async {
    final titleCtrl = TextEditingController();
    final descCtrl = TextEditingController();
    String? selectedSiteId = _sites.isNotEmpty ? _sites.first['id']?.toString() : null;
    String? selectedServiceId = _services.isNotEmpty ? _services.first['id']?.toString() : null;
    String priority = 'MEDIUM';

    final submitted = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) => AlertDialog(
          title: const Text('Raise Service Request'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: titleCtrl,
                  decoration: const InputDecoration(labelText: 'Request Title', border: OutlineInputBorder()),
                ),
                const SizedBox(height: 10),
                if (_sites.isNotEmpty)
                  DropdownButtonFormField<String>(
                    value: selectedSiteId,
                    decoration: const InputDecoration(labelText: 'Site', border: OutlineInputBorder()),
                    items: _sites
                        .map((s) => DropdownMenuItem<String>(
                              value: s['id']?.toString(),
                              child: Text(s['name']?.toString() ?? 'Site'),
                            ))
                        .toList(),
                    onChanged: (v) => setModalState(() => selectedSiteId = v),
                  ),
                if (_sites.isNotEmpty) const SizedBox(height: 10),
                if (_services.isNotEmpty)
                  DropdownButtonFormField<String>(
                    value: selectedServiceId,
                    decoration: const InputDecoration(labelText: 'Service', border: OutlineInputBorder()),
                    items: _services
                        .map((s) => DropdownMenuItem<String>(
                              value: s['id']?.toString(),
                              child: Text(s['name']?.toString() ?? 'Service'),
                            ))
                        .toList(),
                    onChanged: (v) => setModalState(() => selectedServiceId = v),
                  ),
                if (_services.isNotEmpty) const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  value: priority,
                  decoration: const InputDecoration(labelText: 'Priority', border: OutlineInputBorder()),
                  items: const ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
                      .map((p) => DropdownMenuItem(value: p, child: Text(p)))
                      .toList(),
                  onChanged: (v) => setModalState(() => priority = v ?? 'MEDIUM'),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: descCtrl,
                  maxLines: 3,
                  decoration: const InputDecoration(labelText: 'Details', border: OutlineInputBorder()),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFEA580C), foregroundColor: Colors.white),
              onPressed: () async {
                if (titleCtrl.text.trim().isEmpty) return;
                await StaffApiService.createOperationsServiceRequest(
                  employeeId: widget.user.id,
                  title: titleCtrl.text.trim(),
                  description: descCtrl.text.trim(),
                  siteId: selectedSiteId,
                  serviceId: selectedServiceId,
                  priority: priority,
                  token: widget.user.token,
                );
                if (ctx.mounted) Navigator.pop(ctx, true);
              },
              child: const Text('Submit'),
            ),
          ],
        ),
      ),
    );
    if (submitted == true) {
      await _loadInbox();
    }
  }

  Future<void> _openIncidentModal() async {
    final titleCtrl = TextEditingController();
    final descCtrl = TextEditingController();
    String severity = 'MEDIUM';
    String? siteId = _sites.isNotEmpty ? _sites.first['id']?.toString() : null;

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) => AlertDialog(
          title: const Text('Report Field Incident'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(controller: titleCtrl, decoration: const InputDecoration(labelText: 'Incident Title', border: OutlineInputBorder())),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  value: severity,
                  decoration: const InputDecoration(labelText: 'Severity', border: OutlineInputBorder()),
                  items: const ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((s) => DropdownMenuItem(value: s, child: Text(s))).toList(),
                  onChanged: (v) => setModalState(() => severity = v ?? 'MEDIUM'),
                ),
                const SizedBox(height: 10),
                TextField(controller: descCtrl, maxLines: 3, decoration: const InputDecoration(labelText: 'Description', border: OutlineInputBorder())),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFDC2626), foregroundColor: Colors.white),
              onPressed: () async {
                if (titleCtrl.text.trim().isEmpty || descCtrl.text.trim().isEmpty) return;
                await StaffApiService.reportOperationsIncident(
                  employeeId: widget.user.id,
                  title: titleCtrl.text.trim(),
                  description: descCtrl.text.trim(),
                  severity: severity,
                  siteId: siteId,
                  token: widget.user.token,
                );
                if (ctx.mounted) Navigator.pop(ctx, true);
              },
              child: const Text('Report'),
            ),
          ],
        ),
      ),
    );
    if (ok == true) await _loadInbox();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        backgroundColor: Colors.white,
        foregroundColor: const Color(0xFF0F172A),
        elevation: 0.5,
        title: const Text('Operations Workspace', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
        actions: [
          IconButton(icon: const Icon(Icons.report_problem_outlined, color: Color(0xFFDC2626)), tooltip: 'Report Incident', onPressed: _openIncidentModal),
          IconButton(icon: const Icon(Icons.refresh_rounded), onPressed: _loadInbox),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: const Color(0xFFEA580C),
        foregroundColor: Colors.white,
        onPressed: _openRaiseRequestModal,
        icon: const Icon(Icons.add_rounded),
        label: const Text('Service Request', style: TextStyle(fontWeight: FontWeight.w700)),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFFEA580C)))
          : _error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.lock_outline_rounded, size: 40, color: Color(0xFFDC2626)),
                        const SizedBox(height: 10),
                        Text(_error!, textAlign: TextAlign.center, style: const TextStyle(color: Color(0xFF0F172A), fontWeight: FontWeight.w600)),
                        const SizedBox(height: 12),
                        OutlinedButton(onPressed: _loadInbox, child: const Text('Retry')),
                      ],
                    ),
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _loadInbox,
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 90),
                    children: [
                      if (_offlineDrafts.isNotEmpty)
                        Container(
                          margin: const EdgeInsets.only(bottom: 14),
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: const Color(0xFFFFF7ED),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: const Color(0xFFFED7AA)),
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text('${_offlineDrafts.length} offline draft(s) pending sync', style: const TextStyle(fontWeight: FontWeight.w700, color: Color(0xFFC2410C))),
                              ElevatedButton(
                                style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFEA580C), foregroundColor: Colors.white, visualDensity: VisualDensity.compact),
                                onPressed: _syncOfflineDrafts,
                                child: const Text('Sync Now'),
                              ),
                            ],
                          ),
                        ),
                      if (_dispatches.isNotEmpty) ...[
                        const Text('DISPATCHED VISITS', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Color(0xFF64748B), letterSpacing: 0.8)),
                        const SizedBox(height: 8),
                        ..._dispatches.map((d) => _buildDispatchCard(d)),
                        const SizedBox(height: 16),
                      ],
                      Text(
                        'MY WORK ORDERS & REQUESTS (${_workOrders.length})',
                        style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Color(0xFF64748B), letterSpacing: 0.8),
                      ),
                      const SizedBox(height: 8),
                      if (_workOrders.isEmpty)
                        Container(
                          padding: const EdgeInsets.all(20),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: const Color(0xFFE2E8F0)),
                          ),
                          child: const Text(
                            'No work orders assigned to you yet. Tap "+ Service Request" to raise an operational request.',
                            style: TextStyle(color: Color(0xFF64748B), fontSize: 13),
                          ),
                        )
                      else
                        ..._workOrders.map((w) => _buildWorkOrderCard(w)),
                      if (_handovers.isNotEmpty) ...[
                        const SizedBox(height: 16),
                        const Text('SHIFT HANDOVERS', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Color(0xFF64748B), letterSpacing: 0.8)),
                        const SizedBox(height: 8),
                        ..._handovers.map((h) => Container(
                              margin: const EdgeInsets.only(bottom: 10),
                              padding: const EdgeInsets.all(14),
                              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: const Color(0xFFE2E8F0))),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(h['shiftLabel']?.toString() ?? 'Shift', style: const TextStyle(fontWeight: FontWeight.w800)),
                                  Text(h['openItemsSummary']?.toString() ?? '', style: const TextStyle(fontSize: 12.5, color: Color(0xFF475569))),
                                  if (h['acknowledgedAt'] == null && h['outgoingOfficerId'] != widget.user.id)
                                    Padding(
                                      padding: const EdgeInsets.only(top: 8),
                                      child: ElevatedButton(
                                        style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF059669), foregroundColor: Colors.white, visualDensity: VisualDensity.compact),
                                        onPressed: () async {
                                          await StaffApiService.acknowledgeOperationsHandover(employeeId: widget.user.id, handoverId: h['id'].toString(), token: widget.user.token);
                                          await _loadInbox();
                                        },
                                        child: const Text('Acknowledge Handover', style: TextStyle(fontSize: 12)),
                                      ),
                                    ),
                                ],
                              ),
                            )),
                      ],
                      if (_assets.isNotEmpty) ...[
                        const SizedBox(height: 16),
                        const Text('ASSIGNED ASSETS', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Color(0xFF64748B), letterSpacing: 0.8)),
                        const SizedBox(height: 8),
                        ..._assets.map((a) => ListTile(
                              tileColor: Colors.white,
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: const BorderSide(color: Color(0xFFE2E8F0))),
                              title: Text(a['name']?.toString() ?? 'Asset', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
                              subtitle: Text('${a['assetTag']} · ${a['condition']}', style: const TextStyle(fontSize: 11.5)),
                            )),
                      ],
                      if (_incidents.isNotEmpty) ...[
                        const SizedBox(height: 16),
                        const Text('MY REPORTED INCIDENTS', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Color(0xFF64748B), letterSpacing: 0.8)),
                        const SizedBox(height: 8),
                        ..._incidents.map((inc) => ListTile(
                              tileColor: Colors.white,
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: const BorderSide(color: Color(0xFFE2E8F0))),
                              title: Text(inc['title']?.toString() ?? 'Incident', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
                              subtitle: Text('${inc['incidentNumber']} · ${inc['severity']} · ${inc['status']}', style: const TextStyle(fontSize: 11.5)),
                            )),
                      ],
                    ],
                  ),
                ),
    );
  }

  Widget _buildDispatchCard(dynamic d) {
    final wo = d['workOrder'] ?? {};
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFFED7AA)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(wo['workOrderNumber']?.toString() ?? 'DISPATCH', style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, color: Color(0xFFEA580C))),
              Text(d['dispatchStatus']?.toString() ?? 'ASSIGNED', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFF475569))),
            ],
          ),
          const SizedBox(height: 4),
          Text(wo['title']?.toString() ?? 'Field Assignment', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Color(0xFF0F172A))),
          if (d['site'] != null)
            Text('Site: ${d['site']['name']}', style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
        ],
      ),
    );
  }

  Widget _buildWorkOrderCard(dynamic w) {
    final status = w['status']?.toString() ?? 'NEW';
    final id = w['id']?.toString() ?? '';
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(w['workOrderNumber']?.toString() ?? '', style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, color: Color(0xFFEA580C))),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(color: const Color(0xFFF1F5F9), borderRadius: BorderRadius.circular(999)),
                child: Text(status, style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: Color(0xFF334155))),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(w['title']?.toString() ?? '', style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: Color(0xFF0F172A))),
          if ((w['description']?.toString() ?? '').isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(w['description'].toString(), style: const TextStyle(fontSize: 12.5, color: Color(0xFF475569))),
          ],
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: [
              if (status == 'ASSIGNED' || status == 'SCHEDULED' || status == 'BLOCKED')
                ElevatedButton(
                  style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFEA580C), foregroundColor: Colors.white, visualDensity: VisualDensity.compact),
                  onPressed: () => _updateStatus(id, 'IN_PROGRESS'),
                  child: const Text('Start Work', style: TextStyle(fontSize: 12)),
                ),
              if (status == 'IN_PROGRESS') ...[
                ElevatedButton(
                  style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF059669), foregroundColor: Colors.white, visualDensity: VisualDensity.compact),
                  onPressed: () => _updateStatus(id, 'COMPLETED'),
                  child: const Text('Mark Completed', style: TextStyle(fontSize: 12)),
                ),
                OutlinedButton(
                  style: OutlinedButton.styleFrom(visualDensity: VisualDensity.compact),
                  onPressed: () => _promptBlockReason(id),
                  child: const Text('Report Blocker', style: TextStyle(fontSize: 12)),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}
