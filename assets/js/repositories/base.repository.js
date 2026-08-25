(function (VMS) {
    'use strict';
    function BaseRepository(dataset, keyField) { this.dataset = dataset; this.keyField = keyField; }
    BaseRepository.prototype.provider = function () { return VMS.AppContext.getProvider(); };
    BaseRepository.prototype.getById = function (id) { return this.provider().getById(this.dataset, VMS.Utilities.lookupId(id)); };
    BaseRepository.prototype.getByKey = function (key) { return this.provider().getByKey(this.dataset, this.keyField, key); };
    BaseRepository.prototype.query = function (spec) { return this.provider().query(this.dataset, spec || {}); };
    BaseRepository.prototype.count = function (spec) { return this.provider().count(this.dataset, spec || {}); };
    BaseRepository.prototype.create = function (model) { return this.provider().create(this.dataset, model); };
    BaseRepository.prototype.update = function (id, patch, etag) { return this.provider().update(this.dataset, id, patch, etag); };
    BaseRepository.prototype.addAttachments = function (id, files, etag) { return VMS.Services.AttachmentService.AddAttachments(this.dataset, id, files, etag); };
    BaseRepository.prototype.getAttachments = function (id) { return VMS.Services.AttachmentService.ListAttachments(this.dataset, id); };
    BaseRepository.prototype.deleteAttachment = function (id, fileName) { return VMS.Services.AttachmentService.DeleteAttachment(this.dataset, id, fileName); };
    VMS.Repositories.BaseRepository = BaseRepository;
}(window.VMS));
